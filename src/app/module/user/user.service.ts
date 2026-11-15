import { UploadApiResponse } from "cloudinary";
import { cloudinary } from "../../lib/cloudinary";
import { prisma } from "../../lib/prisma";

const uploadProfileImage = async (buffer: Buffer, userId: string) => {
  const cloudinaryResult = await new Promise<UploadApiResponse>((resolve, reject) => {
    cloudinary.uploader
      .upload_stream({ resource_type: "auto" }, 
        async (error, reslut) => {
        if (error) {
         return reject(error)
        }

        if(!reslut){
          return reject(new Error("No Result returned from Cloudinary"))
        }

        resolve(reslut)

          //   return reslut
      })
      .end(buffer);
  });

    const updatedUser = await prisma.user.update({
          where: {
            id: userId,
          },
          data: {
            imageUrl: cloudinaryResult?.secure_url,
            imagePublicId: cloudinaryResult?.public_id,
          },
          omit:{
            password : true
          }
        });
  

    return updatedUser;
};

export const userService = {
  uploadProfileImage,
};
