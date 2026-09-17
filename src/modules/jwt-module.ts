import { ENVIRONMENT } from "../environment/environment";
import { JwtPayload, sign, verify } from "jsonwebtoken";
import {
  bindNodeCallback,
  catchError,
  EMPTY,
  forkJoin,
  from,
  Observable,
  of,
  switchMap,
  tap,
  throwError,
} from "rxjs";
import {
  IJWTInfo,
  IJWTPayload,
  IJWTInfoToken,
  serializeOptions,
  IRefreshDelete,
} from "../types/shared-models";
import { NextFunction, Request, Response } from "express";
import { JSONCookies } from "cookie-parser";
import { serialize } from "cookie";
import { redisClientAuth } from "./redis-module";
import { ACCESS_ROUTES_ROLES } from "../types/access-roles-model";
import { basename } from "path";
import { CustomLogger, loggerPino } from "./logger-module";
import { SERVER_ERRORS } from "../types/errors-model";
export const redisStore = new redisClientAuth();
redisStore
  .init()
  .pipe(
    catchError((err) => {
      localLogger.error({ fn: "redisStore.init()", msg: err.code });
      return EMPTY;
    }),
  )
  .subscribe();

const localLogger: CustomLogger = loggerPino.child({
  ml: basename(__filename),
});

function issueAccessJWT(jwtInfo: IJWTInfo): Observable<string> {
  return from(
    new Promise<string>((resolve, reject) => {
      try {
        resolve(
          sign(
            jwtInfo,
            ENVIRONMENT.JWT.JWT_SECRET,
            ENVIRONMENT.JWT.JWT_SETTINGS,
          ),
        );
      } catch (error) {
        reject(error);
      }
    }),
  );
}
function issueRefreshJWT(jwtInfo: IJWTInfo): Observable<string> {
  return from(
    new Promise<string>((resolve, reject) => {
      try {
        resolve(
          sign(
            jwtInfo,
            ENVIRONMENT.JWT.JWT_REFRESH_SECRET,
            ENVIRONMENT.JWT.JWT_SETTINGS_SECRET,
          ),
        );
      } catch (error) {
        reject(error);
      }
    }),
  );
}
export function jwtSetAll(jwtInfo: IJWTInfo): Observable<IJWTInfoToken> {
  return forkJoin({
    jwt: issueAccessJWT(jwtInfo),
    refreshToken: issueRefreshJWT(jwtInfo),
    jwtInfo: of(jwtInfo),
  }).pipe(
    catchError((err) => {
      localLogger.error({
        fn: "jwtSet",
        user: jwtInfo.userId,
        msg: err.message,
      });
      return of({ jwt: "", refreshToken: "", jwtInfo: jwtInfo });
    }),
  );
}
export function jwtSetAccessToken(
  jwtInfo: IJWTInfo,
): Observable<Omit<IJWTInfoToken, "refreshToken">> {
  return forkJoin({
    jwt: issueAccessJWT(jwtInfo),
    jwtInfo: of(jwtInfo),
  }).pipe(
    catchError((err) => {
      localLogger.error({
        fn: "jwtSet",
        user: jwtInfo.userId,
        msg: err.message,
      });
      return of({ jwt: "", refreshToken: "", jwtInfo: jwtInfo });
    }),
  );
}

export function verifyAccess(req: Request, res: Response, next: NextFunction) {
  verifyJWT(String(JSONCookies(req.cookies)["A3_AccessToken"]), res, req, next);
}
function verifyJWT(
  accessToken: string,
  res: Response,
  req: Request,
  next: NextFunction,
) {
  const boundJwtVerify = bindNodeCallback(verify);
  let jwtVerify$ = boundJwtVerify(accessToken, ENVIRONMENT.JWT.JWT_SECRET);
  jwtVerify$
    .pipe(
      tap((decoded) => {
        if (
          !ACCESS_ROUTES_ROLES.find(
            (el) => el.route === req.originalUrl,
          )?.roles.includes((decoded as IJWTPayload).role)
        ) {
          localLogger.info({
            fn: "verifyJWT",
            user: (decoded as IJWTPayload).userId,
            route: req.originalUrl,
            msg: "Access is forbidden",
          });
          res.status(403).send({ ml: "JWT", msg: "Access is forbidden" });
          let e = { ...new Error(), name: "AccessForbiden" };
          throw e;
        }
      }),
      catchError((err) => {
        switch (err?.name) {
          case "TokenExpiredError":
            localLogger.info({
              fn: "verifyJWT",
              msg: err.message,
              jwt: accessToken.split(".")[2],
            });
            res.headersSent
              ? null
              : res
                  .status(SERVER_ERRORS.get("JWT_EXPIRED")!.code)
                  .send({ ml: "JWT", msg: "Access token is expired" });
            break;
          case "AccessForbiden":
            break;
          default:
            localLogger.error({
              fn: "verifyJWT",
              jwt: accessToken,
              msg: `${err?.name} : ${err.message}`,
            });
            res.headersSent
              ? null
              : res
                  .status(SERVER_ERRORS.get("AUTHENTICATION_FAILED")!.code)
                  .send(`${err?.name} : ${err.message}`);
            break;
        }
        return EMPTY;
      }),
    )
    .subscribe((userData) => {
      (req as any).user = userData as JwtPayload;
      next();
    });
}

export function refreshTokenFn(req: Request, res: Response) {
  let refreshToken = String(JSONCookies(req.cookies)["A3_RefreshToken"]);
  const boundJwtVerify = bindNodeCallback(verify);
  boundJwtVerify(refreshToken, ENVIRONMENT.JWT.JWT_REFRESH_SECRET)
    .pipe(
      switchMap((jwtInfo) =>
        redisStore.getRefreshToken((jwtInfo as IJWTInfo).userId).pipe(
          switchMap((jwtInfoToken) => {
            if (jwtInfoToken?.refreshToken === refreshToken) {
              return of(jwtInfo);
            } else {
              let errMsg = `refreshToken has not been found/not matched. Redis:${jwtInfoToken?.refreshToken} User: ${refreshToken}`;
              localLogger.error({
                fn: "refreshTokenFunc",
                user: (jwtInfo as IJWTInfo).userId,
                msg: errMsg,
              });
              res
                .status(SERVER_ERRORS.get("AUTHENTICATION_FAILED")!.code)
                .send("JsonWebTokenError : RefreshToken has not been found");
              return EMPTY;
            }
          }),
          catchError((e) => {
            return throwError(() => e);
          }),
        ),
      ),
      tap((jwtInfo) =>
        localLogger.info({
          fn: "refreshTokenFunc",
          msg: "New token is issued",
          user: (jwtInfo as IJWTInfo).userId,
        }),
      ),
      switchMap((jwtInfo) =>
        jwtSetAccessToken({
          _id: (jwtInfo as IJWTInfo)._id,
          userId: (jwtInfo as IJWTInfo).userId,
          role: (jwtInfo as IJWTInfo).role,
        }),
      ),
      tap(
        (jwtInfoToken) => (res = setCookiesJWT_Tokens(res, jwtInfoToken.jwt)),
      ),
      switchMap((jwtInfoToken) =>
        of({ response: res, jwtInfoToken: jwtInfoToken }),
      ),
      catchError((err) => {
        res
          .status(SERVER_ERRORS.get("AUTHENTICATION_FAILED")!.code)
          .send(`${err?.name} : ${err.message}`);
        return EMPTY;
      }),
    )
    .subscribe((data) => res.send(data.jwtInfoToken.jwtInfo));
}
export function saveRefreshToStore(
  jwtInfoToken: IJWTInfoToken,
): Observable<IJWTInfoToken> {
  return redisStore.saveRefresh(jwtInfoToken).pipe(
    catchError((err) => {
      localLogger.error({
        fn: "saveRefreshToStore",
        user: jwtInfoToken.jwtInfo?.userId,
        msg: err.message,
      });
      return of(jwtInfoToken);
    }),
  );
}
export function getAllRefreshToStore(
  req: Request,
  res: Response,
): Observable<{ userId: string; data: string }[]> {
  return redisStore.gelAllRefreshTokens().pipe(
    catchError((err) => {
      localLogger.error({ fn: "gelAllRefreshTokens", msg: err.message });
      return throwError(() => err);
    }),
  );
}
export function deleteRefreshToken(
  req: Request,
  res: Response,
): Observable<IRefreshDelete> {
  return redisStore.removeRefreshToken(req.body.userId).pipe(
    tap((deleted) =>
      localLogger.info({
        fn: "deleteRefreshToken",
        user: req.body.userId,
        msg: deleted.deleted ? "success" : "fail",
      }),
    ),
    catchError((err) => {
      localLogger.error({
        fn: "deleteRefreshToken",
        user: req.body.userId,
        msg: err.message,
      });
      err.module = "JWT";
      return throwError(() => err);
    }),
  );
}
export function setCookiesJWT_Tokens(
  res: Response,
  accessToken: string,
  refreshToken?: string,
): Response {
  clearCookiesJWTTokens(res, refreshToken != undefined);
  return res.setHeader(
    "Set-Cookie",
    refreshToken
      ? [
          serialize("A3_AccessToken", accessToken, serializeOptions),
          serialize("A3_RefreshToken", refreshToken, serializeOptions),
        ]
      : [serialize("A3_AccessToken", accessToken, serializeOptions)],
  );
}
export function clearCookiesJWTTokens(
  res: Response,
  refreshClear: boolean = true,
): Response {
  res.clearCookie("A3_AccessToken", {
    httpOnly: true,
    domain: "euw.devtunnels.ms",
  });
  res.clearCookie("A3_RefreshToken", {
    httpOnly: true,
    domain: "euw.devtunnels.ms",
  });
  return res;
}
