import createError, { HttpError } from "http-errors";
import express, { Request, Response } from "express";
import path from "path";
import cookieParser from "cookie-parser";
import loggerDev from "morgan";
import cors from "cors";
import { pino } from "pino";

import * as indexRouter from "./routes/index";
import * as usersRouter from "./routes/auth-routes";
import * as mailRouter from "./routes/mail-routes";
import { router as adminRouter } from "./routes/admin-routtes";
import { ENVIRONMENT } from "./environment/environment";

export const app = express();
export var logger = pino(ENVIRONMENT.LOGGING.OPTIONS);
const transport = pino.transport(ENVIRONMENT.LOGGING.TRANSPORT);
logger = pino(transport);
// view engine setup
app.set("views", path.join(__dirname, "views"));
app.set("view engine", "pug");

app.use(loggerDev("dev"));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
//console.log('process.env.COOKIE_DOMAIN ',process.env.COOKIE_DOMAIN  )
const cookieDomain = (
  process.env.COOKIE_DOMAIN || ".euw.devtunnels.ms"
).replace(/\./g, "\\.");
app.use(
  cors({
    credentials: true,
    origin: [/^http:\/\/localhost(:\d+)?$/, new RegExp(`${cookieDomain}$`)],
  }),
);
app.use(express.static(path.join(__dirname, "public")));

app.use("/", indexRouter.router);
app.use("/users", usersRouter.router);
app.use("/mail", mailRouter.router);
app.use("/admin", adminRouter);

// catch 404 and forward to error handler
app.use(function (req, res, next) {
  next(createError(404));
});

// error handler
app.use(function (err: HttpError, req: Request, res: Response) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get("env") === "development" ? err : {};
  // render the error page
  res.status(err.status || 500);
  res.render("error");
});
