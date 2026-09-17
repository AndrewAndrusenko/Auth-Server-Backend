import * as express from "express";
import { EmailHandler, IConfirmEmailParams } from "../modules/email-module";
import { catchError, EMPTY } from "rxjs";

export const router = express.Router();
const mailService = new EmailHandler();
router.post("/send", (req, res) => {
  let mailOption = req.body as IConfirmEmailParams;
  mailService
    .sendMessage(mailOption)
    .pipe(
      catchError((e) => {
        res
          .status(500)
          .send({
            msg: (e as Error).message,
            name: (e as Error).name,
            ml: "MailService",
          });
        return EMPTY;
      }),
    )
    .subscribe((data) => res.send(data));
});
