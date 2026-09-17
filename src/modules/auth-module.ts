import { ObjectId } from "mongodb";
import { catchError, EMPTY, of, switchMap, take, throwError } from "rxjs";
import {
  jwtSetAll,
  saveRefreshToStore,
  deleteRefreshToken,
  clearCookiesJWTTokens,
  setCookiesJWT_Tokens,
} from "./jwt-module";
import { Request, Response } from "express";
import { basename } from "path";
import { IUser } from "../types/shared-models";
import { SERVER_ERRORS } from "../types/errors-model";
import { loggerPino } from "./logger-module";
import { hashUserPassword, verifyUserPassword } from "./auth-hash-module";
import { mongoClient } from "../bin/auth-server";
const localLogger = loggerPino.child({ ml: basename(__filename) });

export function logInUser(req: Request, res: Response) {
  let userFromUI = req.body as IUser;
  mongoClient
    .findUser(userFromUI)
    .pipe(
      take(1),
      switchMap((user) =>
        user === null
          ? throwError(() => new Error("Incorrect userId"))
          : of(user),
      ),
      switchMap((user) =>
        user?.emailConfirmed === true
          ? of(user)
          : throwError(() => {
              let emailErr = new Error("Email address has not been confirmed");
              emailErr.stack = JSON.stringify(user);
              emailErr.name = "email";
              return emailErr;
            }),
      ),
      switchMap((user) => verifyUserPassword(userFromUI.password, user)),
      switchMap((userPassword) =>
        userPassword.passwordConfirmed
          ? of(userPassword.userData)
          : throwError(() => new Error("Incorrect password")),
      ),
      switchMap((user) =>
        jwtSetAll({
          _id: user._id as ObjectId,
          userId: user.userId,
          role: user.role,
        }),
      ),
      switchMap((jwtInfoToken) =>
        saveRefreshToStore({
          ...jwtInfoToken,
          timeSaved: new Date().toLocaleString(),
        }),
      ),
      catchError((e) => {
        localLogger.error({
          fn: "logInUser",
          user: userFromUI.userId,
          msg: (e as Error).message,
          err_name: (e as Error).name,
        });
        res.send({
          errorResponse: {
            message: (e as Error).message,
            name: (e as Error).name,
            stack: (e as Error)?.stack,
          },
        });
        return EMPTY;
      }),
    )
    .subscribe((jwtInfoToken) => {
      res = setCookiesJWT_Tokens(
        res,
        jwtInfoToken.jwt,
        jwtInfoToken.refreshToken,
      );
      res.send(jwtInfoToken);
      localLogger.info({
        fn: "logInUser",
        msg: "success",
        user: userFromUI.userId,
      });
    });
}
export function logOutUser(req: Request, res: Response) {
  res = clearCookiesJWTTokens(res);
  deleteRefreshToken(req, res)
    .pipe(
      catchError((err) => {
        res.status(SERVER_ERRORS.get("INTERNAL_ERROR")!.code).send(err);
        return EMPTY;
      }),
    )
    .subscribe((data) => {
      res.send({ userId: req.body.userId, logout: data.deleted });
      localLogger.info({
        fn: "logOutUser",
        msg: "success",
        user: req.body.userId,
      });
    });
}
export function signUpNewUser(req: Request, res: Response) {
  let newUser = req.body as IUser;
  return hashUserPassword(newUser.password)
    .pipe(
      take(1),
      switchMap((hashPassword) =>
        mongoClient.addUser({ ...newUser, password: hashPassword }),
      ),
      catchError((err) => {
        res.status(SERVER_ERRORS.get("INTERNAL_ERROR")!.code).send(err);
        localLogger.error({ fn: "signUpNewUser", msg: err.message });
        return EMPTY;
      }),
    )
    .subscribe((data) => {
      res.send(data);
      localLogger.info({
        fn: "signUpNewUser",
        msg: "success",
        user: newUser.userId,
      });
    });
}
export function getUserData(req: Request, res: Response) {
  let userData = (req as any)?.user || {};
  res.send(userData);
}
export function updateUserData(req: Request, res: Response) {
  let newUser = req.body as IUser;
  mongoClient
    .updateUser(newUser)
    .pipe(
      take(1),
      catchError((e) => {
        res.status(SERVER_ERRORS.get("INTERNAL_ERROR")!.code).send(e);
        return EMPTY;
      }),
    )
    .subscribe((data) => {
      res.send(data);
      localLogger.info({
        fn: "updateUserData",
        msg: JSON.stringify(newUser),
        user: newUser.userId,
      });
    });
}
export function findAllUserData(req: Request, res: Response) {
  mongoClient
    .findAllUsers()
    .pipe(
      take(1),
      catchError((e) => {
        res.status(SERVER_ERRORS.get("INTERNAL_ERROR")!.code).send(e);
        return EMPTY;
      }),
    )
    .subscribe((data) => res.send(data));
}
export function deleteUser(req: Request, res: Response) {
  mongoClient
    .deleteUser(req.body.userId)
    .pipe(
      take(1),
      catchError((e) => {
        res.status(SERVER_ERRORS.get("INTERNAL_ERROR")!.code).send(e);
        return EMPTY;
      }),
    )
    .subscribe((data) => {
      res.send(data);
      localLogger.info({
        fn: "deleteUser",
        msg: data?.deletedCount ? "success" : "fail",
        user: req.body.userId,
      });
    });
}

export function setResetPasswordToken(req: Request, res: Response) {
  let data = req.body as { email: string; passwordToken: string };
  mongoClient
    .setResetPasswordToken(data.email, data.passwordToken)
    .pipe(
      take(1),
      catchError((err) => {
        res.status(SERVER_ERRORS.get("INTERNAL_ERROR")!.code).send(err);
        return EMPTY;
      }),
    )
    .subscribe((data) => {
      res.send(data);
      localLogger.info({
        fn: "setResetPasswordToken",
        msg: req.body.data?.passwordToken,
        user: data?.email,
      });
    });
}
export function setNewPassword(req: Request, res: Response) {
  let data = req.body as { id: string; token: string; password: string };
  hashUserPassword(data.password)
    .pipe(
      take(1),
      switchMap((hashedPassword) =>
        mongoClient.resetPassword(data.id, data.token, hashedPassword),
      ),
      catchError((err) => {
        res.status(SERVER_ERRORS.get("INTERNAL_ERROR")!.code).send(err);
        return EMPTY;
      }),
    )
    .subscribe((data) => {
      res.send(data);
      localLogger.info({
        fn: "setNewPassword",
        msg: data ? "success" : `failed for token ${req.body.token}`,
        user: req.body.id,
      });
    });
}
export function confirmEmailAddress(req: Request, res: Response) {
  mongoClient
    .confirmEmail(req.body)
    .pipe(
      take(1),
      switchMap((updateResult) =>
        of(updateResult.modifiedCount !== 0 || updateResult.matchedCount !== 0),
      ),
      catchError((err) => {
        res.status(SERVER_ERRORS.get("INTERNAL_ERROR")!.code).send(err);
        localLogger.error({
          fn: "confirmEmailAddress",
          user: req.url,
          msg: err.message,
        });
        return EMPTY;
      }),
    )
    .subscribe((data) => {
      res.send(data);
      localLogger.info({
        fn: "confirmEmailAddress",
        msg: data ? "success" : "fail",
        user: req.body.id || "0",
      });
    });
}
//VALIDATORS
export function checkEmailUnique(req: Request, res: Response) {
  mongoClient
    .checkEmailUnique((req.query as { email: string }).email)
    .pipe(
      take(1),
      catchError((err) => {
        res.status(SERVER_ERRORS.get("INTERNAL_ERROR")!.code).send(err);
        localLogger.error({
          fn: "checkEmailUnique",
          msg: err.message,
          user: (req.query as { userId: string }).userId,
        });
        return EMPTY;
      }),
    )
    .subscribe((data) => res.send(data));
}
export function checkUserIdUnique(req: Request, res: Response) {
  mongoClient
    .checkUserIdUnique((req.query as { userId: string }).userId)
    .pipe(
      take(1),
      catchError((err) => {
        res.status(SERVER_ERRORS.get("INTERNAL_ERROR")!.code).send(err);
        localLogger.error({
          fn: "checkUserIdUnique",
          msg: err.message,
          user: (req.query as { userId: string }).userId,
        });
        return EMPTY;
      }),
    )
    .subscribe((data) => res.send(data));
}