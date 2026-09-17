import {
  Db,
  DeleteResult,
  InsertOneResult,
  MongoClient,
  ObjectId,
  UpdateResult,
  WithId,
} from "mongodb";
import { catchError, from, map, Observable, throwError } from "rxjs";
import { ENVIRONMENT } from "../environment/environment";
import { IUser } from "../types/shared-models";
import { CustomLogger, loggerPino } from "./logger-module";
import { basename } from "path";

const localLogger: CustomLogger = loggerPino.child({ ml: basename(__filename)});
export class mongoDBClient extends MongoClient {
  private dbInst = new Db(this, ENVIRONMENT.MONGO_DB_CONFIG.mongdDBName);
  private _isOpened: boolean = false;
  get isOpened(): boolean {return this._isOpened}
  constructor() {
    super(ENVIRONMENT.MONGO_DB_CONFIG.mongoUrl, {
      connectTimeoutMS: 1000,
      serverSelectionTimeoutMS: 1000,
      retryWrites: true,
    });
    this.on("open", () => this._isOpened = true);
    this.on("close", () => {
      localLogger.error({
        fn: "mongoDBClient.constructor",
        msg: "MongoDB server is disconnected",
      });
      this._isOpened = false;
    });
  }
  findUser(user: IUser): Observable<IUser | null> {
    return from(
      this.dbInst
        .collection<IUser>("auth-users-data")
        .findOne({ userId: user.userId }),
    ).pipe(catchError((err) => throwError(() => err)));
  }
  findAllUsers(): Observable<IUser[] | null> {
    return from(
      this.dbInst.collection<IUser>("auth-users-data").find().toArray(),
    ).pipe(catchError((err) => throwError(() => err)));
  }
  deleteUser(userId: string): Observable<DeleteResult | null> {
    return from(
      this.dbInst
        .collection<IUser>("auth-users-data")
        .deleteOne({ userId: userId }),
    ).pipe(catchError((err) => throwError(() => err)));
  }
  addUser(newUser: IUser): Observable<InsertOneResult<IUser>> {
    return from(
      this.dbInst.collection<IUser>("auth-users-data").insertOne(newUser),
    ).pipe(catchError((err) => throwError(() => err)));
  }
  updateUser(newUser: IUser): Observable<UpdateResult<IUser>> {
    let dataWitoutId = { ...newUser };
    delete dataWitoutId._id;
    return from(
      this.dbInst
        .collection<IUser>("auth-users-data")
        .updateOne(
          { _id: new ObjectId(newUser._id) },
          { $set: { ...dataWitoutId } },
        ),
    ).pipe(
      catchError((err) => {
        localLogger.error({
          fn: "updateUser",
          msg: err.message,
          user: JSON.stringify(dataWitoutId),
        });
        ((err.msg = err.message), (err.ml = "MongoService"));
        return throwError(() => err);
      }),
    );
  }
  resetPassword(
    id: string,
    token: string,
    password: string,
  ): Observable<WithId<IUser> | null> {
    return from(
      this.dbInst.collection<IUser>("auth-users-data").findOneAndUpdate(
        {
          _id: new ObjectId(id),
          passwordToken: token,
        },
        {
          $set: { password: password },
          $unset: { passwordToken: "" },
        },
        { returnDocument: "after" },
      ),
    ).pipe(catchError((err) => throwError(() => err)));
  }
  setResetPasswordToken(
    email: string,
    passwordToken: string,
  ): Observable<WithId<IUser> | null> {
    return from(
      this.dbInst
        .collection<IUser>("auth-users-data")
        .findOneAndUpdate(
          { email: email },
          { $set: { passwordToken: passwordToken } },
          { returnDocument: "after" },
        ),
    ).pipe(catchError((err) => throwError(() => err)));
  }
  checkUserIdUnique(newUserID: string): Observable<boolean> {
    return from(
      this.dbInst
        .collection<IUser>("auth-users-data")
        .countDocuments({ userId: newUserID }),
    ).pipe(
      map((count) => count > 0),
      catchError((err) => throwError(() => err)),
    );
  }
  checkEmailUnique(newEmail: string): Observable<boolean> {
    return from(
      this.dbInst
        .collection<IUser>("auth-users-data")
        .countDocuments({ email: newEmail }),
    ).pipe(
      map((count) => count > 0),
      catchError((err) => throwError(() => err)),
    );
  }
  confirmEmail(data: { id: string; token: string }): Observable<UpdateResult> {
    return from(
      this.dbInst.collection<IUser>("auth-users-data").updateOne(
        { _id: new ObjectId(data.id), token: data.token },
        {
          $set: { emailConfirmed: true },
          $unset: { token: "" },
        },
      ),
    ).pipe(catchError((err) => throwError(() => err)));
  }
}
