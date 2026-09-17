import { createClient, RedisClientType } from "redis";
import {
  catchError,
  from,
  map,
  Observable,
  of,
  switchMap,
  tap,
  throwError,
} from "rxjs";
import {
  IJWTInfo,
  IJWTInfoToken,
  IRefreshDelete,
} from "../types/shared-models";
import { ENVIRONMENT } from "../environment/environment";
import * as path from "path";
import { CustomLogger, loggerPino } from "./logger-module";

const localLogger: CustomLogger = loggerPino.child({
  ml: path.basename(__filename),
});
export class redisClientAuth {
  private client: RedisClientType | null;
  public isOpen: boolean = false;
  constructor() {
    this.client = null;
  }
  init(): Observable<boolean> {
    if (this.client?.isOpen) {
      return of(true);
    } else {
      return from(createClient().connect()).pipe(
        tap((newClient) => (this.client = newClient as RedisClientType)),
        tap(() => (this.isOpen = this.client?.isOpen || false)),
        tap(() =>
          this.client?.on("error", () => {
            this.client?.disconnect();
            localLogger.info({
              fn: "redisClientAuth.init",
              msg: "redis client disconneted",
            });
          }),
        ),
        switchMap(() => of(true)),
        catchError((err) => {
          localLogger.error({ fn: "redisClientAuth.init1", msg: err.code });
          return throwError(() => new Error(err.code));
        }),
      );
    }
  }

  saveRefresh(data: IJWTInfoToken): Observable<IJWTInfoToken> {
    return this.init().pipe(
      switchMap(() =>
        from(
          this.client?.hSet(
            ENVIRONMENT.JWT.JWT_STORE_NAME,
            (data.jwtInfo as IJWTInfo).userId,
            JSON.stringify({ ...data, timeSaved: new Date().toLocaleString() }),
          ) as Promise<number | null>,
        ),
      ),
      tap(() =>
        localLogger.debug(
          "User:",
          (data.jwtInfo as IJWTInfo).userId,
          "| Refresh token has been saved?",
          true,
        ),
      ),
      switchMap(() => of(data)),
      catchError((err) => {
        localLogger.error({
          fn: "saveRefresh",
          user: data.jwtInfo?.userId,
          msg: err.message,
        });
        return of(data);
      }),
    );
  }

  getRefreshToken(userId: string): Observable<IJWTInfoToken> {
    return this.init().pipe(
      switchMap(() =>
        from(
          this.client?.hGet(ENVIRONMENT.JWT.JWT_STORE_NAME, userId) as Promise<
            string | null
          >,
        ).pipe(map((res) => JSON.parse(res as string))),
      ),
      catchError((err) => {
        localLogger.error({
          fn: "getRefreshToken",
          user: userId,
          msg: err.message,
        });
        return of({ refreshToken: "", jwt: "", jwtInfo: null });
      }),
    );
  }
  removeRefreshToken(userId: string): Observable<IRefreshDelete> {
    return this.init().pipe(
      switchMap(() =>
        from(
          this.client?.HDEL(
            ENVIRONMENT.JWT.JWT_STORE_NAME,
            userId,
          ) as Promise<number>,
        ).pipe(
          map((res) => {
            return { userId: userId, deleted: res };
          }),
        ),
      ),
      catchError((err) => {
        localLogger.error({
          fn: "removeRefreshToken",
          user: userId,
          msg: err.message,
        });
        return of({ userId: userId, deleted: 0 });
      }),
    );
  }
  gelAllRefreshTokens(): Observable<{ userId: string; data: string }[]> {
    return this.init().pipe(
      switchMap(() =>
        from(
          this.client?.hGetAll(ENVIRONMENT.JWT.JWT_STORE_NAME) as Promise<
            Record<string, string>
          >,
        ).pipe(
          map((res) => {
            return Object.entries(res).map((el) => {
              return { userId: el[0], data: JSON.parse(el[1]) };
            });
          }),
        ),
      ),
      catchError((err) => {
        localLogger.error({ fn: "gelAllRefreshTokens", msg: err.message });
        err.module = "Redis";
        return throwError(() => err);
      }),
    );
  }
}
