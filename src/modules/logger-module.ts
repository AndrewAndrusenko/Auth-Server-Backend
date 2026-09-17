import { Logger, pino } from "pino";
import { ENVIRONMENT } from "../environment/environment";

export interface IChildLogger {
  ml: string;
}
export interface IErrorLogMessage {
  fn: string;
  msg: string;
  user?: string;
  jwt?: string;
  err_name?: string;
}
export interface IInfoLogMessage {
  fn: string;
  msg: string;
  user?: string;
  jwt?: string;
  route?: string;
}
export type CustomLogger = Omit<Logger, "error" | "child" | "info"> & {
  error: (err: IErrorLogMessage) => void;
  info: (err: IInfoLogMessage) => void;
  child: (module: IChildLogger) => CustomLogger;
};
export const loggerPino: CustomLogger = pino(
  ENVIRONMENT.LOGGING.OPTIONS,
  pino.transport(ENVIRONMENT.LOGGING.TRANSPORT),
);
