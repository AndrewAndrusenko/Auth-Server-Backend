import { Router } from "express";
import {
  deleteRefreshToken,
  getAllRefreshToStore,
  verifyAccess,
} from "../modules/jwt-module";
import { catchError, EMPTY } from "rxjs";
import { deleteUser, findAllUserData } from "../modules/auth-module";
export const router = Router();

router.get("/getAllTokens", verifyAccess, (req, res) => {
  getAllRefreshToStore(req, res)
    .pipe(
      catchError((e) => {
        res.status(500).send({ msg: e.message, ml: e.module });
        return EMPTY;
      }),
    )
    .subscribe((data) => res.send(data));
});
router.post("/delToken", verifyAccess, (req, res) => {
  deleteRefreshToken(req, res)
    .pipe(
      catchError((e) => {
        res.status(500).send({ msg: e.message, ml: e.module });
        return EMPTY;
      }),
    )
    .subscribe((data) => res.send(data));
});
/* Get all user data. */
router.get("/all", verifyAccess, async function (req, res) {
  findAllUserData(req, res);
});
router.post("/user-del", verifyAccess, (req, res) => {
  deleteUser(req, res);
});
