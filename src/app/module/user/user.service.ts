import { UploadApiResponse } from "cloudinary";
import { cloudinary } from "../../lib/cloudinary";
import { prisma } from "../../lib/prisma";

//* Upload Profile Image 
const uploadProfileImage = async (buffer: Buffer, userId: string) => {

  const currentUser = await prisma.user.findUnique({
    where: {
      id: userId
    },
    select: {
      imagePublicId : true,
      imageUrl: true,
    }
  })

  //* cloudinary uploader funciton
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

      })
      .end(buffer);
  });

  //* Updating the imageUrl, imagePublicId into db
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
  
    //* Deletign the previous image
    if(currentUser?.imagePublicId && currentUser.imageUrl){
      await cloudinary.uploader.destroy(currentUser.imagePublicId)
    }

    return updatedUser;
};

export const userService = {
  uploadProfileImage,
};
