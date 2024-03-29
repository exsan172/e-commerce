import { Response, Request, NextFunction } from "express"
import moment from "moment-timezone"
import orderService from "../services/order.service"
import cartService from "../services/cart.service"
import config from "../configs/index.config"
import notificationService from "../services/notification.service"
import sendNotification from "../helpers/notification.helper"
import generateQr from "../helpers/generateQr.helper"
import userService from "../services/user.service"

const orderController = {
    getOrder : async (req:Request, res:Response, next:NextFunction) => {
        try {
            
            let filterData = {}

            if(req.query.is_admin === undefined && req.query.is_admin !== "true") {
                filterData["created_by"] = req.body.dataAuth.id_user
            }

            if(req.query.order_status !== undefined) {
                filterData["order_status"] = req.query.order_status
            }

            if(req.query.id !== undefined) {
                filterData["_id"] = req.query.id
            }
            
            const order = await orderService.getOrder(filterData)
            return config.response(res, 200, true, "sukses mengambil data order", order)

        } catch (error) {
            return config.response(res, 400, false, error.message)
        }
    },
    createOrder : async (req:Request, res:Response, next:NextFunction) => {
        try {
            const checkRole = req.body.dataAuth.role
            if(checkRole === "admin") {
                return config.response(res, 400, false, "hanya user yang bisa membuat order")
            }

            const getDataCart = await cartService.getCart({ created_by: req.body.dataAuth.id_user })
            if(getDataCart.length > 0) {
                let listId:Array<any>     = []
                let totalPrice:number     = 0
    
                for(const i in getDataCart) {
                    listId.push(getDataCart[i]._id)
                    totalPrice += getDataCart[i].total_price
                }
    
                const deleteCart = await cartService.deletetManyCart(listId)
                if(deleteCart) {
                    const order = await orderService.createOrder({
                        product     : getDataCart,
                        total_price : totalPrice,
                        created_by  : req.body.dataAuth.id_user
                    })
                    
                    const sendNotif = await sendNotification(req.body.dataAuth.fcm_token, "Order berhasil di buat", "Order berhasil di buat, silahkan lakukan pembayaran di kasir")
                    if(sendNotif.status === true) {
                        await notificationService.createNotification({
                            message  : "Order berhasil di buat, silahkan lakukan pembayaran di kasir",
                            for_user : req.body.dataAuth.id_user
                        })
                    }

                    // notif to admin
                    const getAdminAccout = await userService.getUserAllWithFilter({ role : "admin" })
                    for(const l in getAdminAccout) {
                        await sendNotification(getAdminAccout[l].fcm_token, "Order baru tersedia", "Order baru di buat, silahkan konfirmasi pemesanan")
                    }
                    
                    const QRGenerate = await generateQr(order._id as any)
                    if(QRGenerate.status === true) {
                        await orderService.updateOrder(order._id as any, {
                            qr_code_id : QRGenerate.message
                        })
                    }

                    const getLatestDataOrder = await orderService.getOneOrder(order._id as any)
                    return config.response(res, 200, true, "sukses membuat order baru", getLatestDataOrder)
                }

            } else {
                return config.response(res, 400, false, "data cart tidak di temukan")
            }
            
        } catch (error) {
            return config.response(res, 400, false, error.message)
        }
    },
    detailOrder : async (req:Request, res:Response, next:NextFunction) => {
        try {
            const detail = await orderService.getOneOrder(req.query.id as string)
            if(detail === null) {
                return config.response(res, 400, false, "data order tidak di temukan", [], [
                    {
                        field : "id",
                        message : `data dengan id ${req.query.id} tidak di temukan`
                    }
                ])

            } else {
                return config.response(res, 200, true, "sukses mengambil data order", detail)
            }
        } catch (error) {
            return config.response(res, 400, false, error.message)
        }
    },
    updateOrder : async (req:Request, res:Response, next:NextFunction) => {
        try {
            const checkRole = req.body.dataAuth.role
            if(checkRole === "user") {
                return config.response(res, 400, false, "hanya admin yang bisa mengubah data")
            }

            const checkOrder = await orderService.getOneOrder(req.query.id as string)
            if(checkOrder === null) {
                return config.response(res, 400, false, "data order tidak di temukan", [], [
                    {
                        field : "id",
                        message : `data dengan id ${req.query.id} tidak di temukan`
                    }
                ])
            }

            let orderData = {
                updated_at   : moment().tz("Asia/Jakarta")
            }

            if(req.body.order_status !== undefined) {
                orderData["order_status"] = req.body.order_status
            }

            if(req.body.pay_status !== undefined) {
                orderData["pay_status"] = req.body.pay_status
            }

            await orderService.updateOrder(req.query.id as string, orderData)
            const latestData = await orderService.getOneOrder(req.query.id as string)
            
            // get role user
            const userRole = await userService.getOne({_id : latestData.created_by})
            if(userRole !== null) {
                if(req.body.order_status !== undefined && latestData.order_status === true) {
                    const sendNotif = await sendNotification(userRole.fcm_token, "Pesanan selesai", "Pesanan selesai, silahkan ambil di kasir")
                    if(sendNotif.status === true) {
                        await notificationService.createNotification({
                            message  : "Pesanan selesai, silahkan ambil di kasir",
                            for_user : latestData.created_by
                        })
                    }
                }
    
                if(req.body.pay_status !== undefined && latestData.pay_status === true) {
                    const sendNotif = await sendNotification(userRole.fcm_token, "Pembayaran di konfirmasi", "Pembayaran dikonfirmasi, silahkan menunggu pesanan anda")
                    if(sendNotif.status === true) {
                        await notificationService.createNotification({
                            message  : "Pembayaran dikonfirmasi, silahkan menunggu pesanan anda",
                            for_user : latestData.created_by
                        })
                    }
                }
            }

            return config.response(res, 200, true, "sukses update data order", latestData)

        } catch (error) {
            return config.response(res, 400, false, error.message)
        }
    }
}

export default orderController