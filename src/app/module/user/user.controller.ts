import { NextFunction, Request, Response } from "express";
import { catchAsync } from "../../utils/catchAsync";
import { userService } from "./user.service";
import { sendResponse } from "../../utils/sendResponse";
import httpStatus from "http-status";

const uploadProfileImage = catchAsync(async (req: Request, res: Response, next: NextFunction) => {

    if(!req.file){
        throw new Error("No file found")
    }

    const userId = req.user?.userId!
    
  const reslut = await userService.uploadProfileImage(req.file?.buffer, userId)

    sendResponse(res, {
        statusCode: 200,
        success: true,
        message: "Profile image uploaded successfully",
        data: reslut,
    });
    

})

export const userController = {
    uploadProfileImage
}