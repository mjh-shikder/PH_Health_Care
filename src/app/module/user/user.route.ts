import { Router } from "express";
import { userController } from "./user.controller";
import { upload } from "../../lib/multer";
import { auth } from "../../middleware/checkAuth";
import { Role } from "../../../generated/prisma/client";


const router = Router();

router.patch("/profile-image",auth(Role.ADMIN, Role.SUPER_ADMIN, Role.DOCTOR, Role.PATIENT),upload.single("profileImage") ,userController.uploadProfileImage);

export const UserRoutes = router;