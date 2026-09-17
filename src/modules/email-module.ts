import NodeMailer, { SentMessageInfo } from "nodemailer";
import { MailOptions } from "nodemailer/lib/sendmail-transport";
import { catchError, from, Observable, throwError } from "rxjs";
import { mailDrafts, TMailTypes } from "../types/mails-drafts";
import { ENVIRONMENT } from "../environment/environment";
import { CustomLogger, loggerPino } from "./logger-module";
import { basename } from "path";
export interface IMailOptions {
  to: string;
  subject: string;
  text: string;
  html: string;
}
export interface IConfirmEmailParams {
  emailUser: string;
  confirmLink: string;
  type: TMailTypes;
}
const localLogger: CustomLogger = loggerPino.child({
  ml: basename(__filename),
});
export class EmailHandler {
  private transport;
  constructor() {
    this.transport = NodeMailer.createTransport({
      service: "Yandex",
      auth: {
        user: ENVIRONMENT.MAILING.login,
        pass: ENVIRONMENT.MAILING.password,
      },
    });
  }
  sendMessage(mailData: IConfirmEmailParams): Observable<SentMessageInfo> {
    let mailOptions: MailOptions = {
      from: ENVIRONMENT.MAILING.emailAdress,
      to: mailData.emailUser,
      subject: mailDrafts[mailData.type].subject,
      text:
        mailDrafts[mailData.type].text +
        mailData.confirmLink +
        mailDrafts[mailData.type].text2,
      html: "",
    };
    return from(this.transport.sendMail(mailOptions)).pipe(
      catchError((err) => {
        localLogger.error({
          fn: "sendMessage",
          msg: err.message,
          user: mailData.confirmLink,
        });
        return throwError(() => err);
      }),
    );
  }
}
