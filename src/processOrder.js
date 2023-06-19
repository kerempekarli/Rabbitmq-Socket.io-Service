const db = require("./db");
require("dotenv").config();
const stripe = require("stripe")(process.env.STRIPE_SECRET_TEST);
const processOrder = async (orderData, io) => {
  try {
    let inStock = [];
    let notInStock = [];
    const { userId, payment_id } = orderData;
    const cartItems = await getCartItemsByUserId(userId);
    await performStockCheck(
      cartItems,
      io,
      userId,
      payment_id,
      inStock,
      notInStock
    );
    const total_amount = await calculateCartItemsTotalPrice(inStock);
    updateStock(inStock);
    const paymentResult = await payment(
      payment_id,
      io,
      userId,
      total_amount,
      inStock
    );
    if (paymentResult == true) {
      const order_id = await createOrder(userId, total_amount);
      addUserNotification(
        userId,
        "order",
        order_id,
        "Order successfully created"
      );

      for (const item of inStock) {
        console.log("ITEM ", item);
        const { seller_id, product_id, quantity } = item;
        console.log("PRODUCT_ID ", product_id);
        const unit_price = await getProductPrice(seller_id, product_id);
        await addOrderDetail(
          order_id,
          product_id,
          quantity,
          unit_price,
          seller_id
        );
        sendNotificationToSeller(
          seller_id,
          product_id,
          "Yeni bir sipariş aldınız"
        );
      }
    }
    sendNotificationToUserIfNotInStock(notInStock);
  } catch (err) {
    console.log(err);
  }
};
async function getCartItemsByUserId(userId) {
  try {
    const query = "SELECT id FROM carts WHERE user_id = $1";
    const result = await db.query(query, [userId]);
    const cartId = result.rows[0].id;

    const cartItemsQuery = "SELECT * FROM cart_items WHERE cart_id = $1";
    const cartItemsResult = await db.query(cartItemsQuery, [cartId]);
    const cartItems = cartItemsResult.rows;
    return cartItems;
  } catch (error) {
    console.error("Hata oluştu:", error);
    throw error;
  }
}
async function performStockCheck(
  cartItems,
  io,
  userId,
  payment_id,
  inStock,
  notInStock
) {
  try {
    const orderId = await createOrder(userId, 0);

    for (const cartItem of cartItems) {
      const productId = cartItem.product_id;
      const quantity = cartItem.quantity;
      let amountWithCount = 0;
      // Stok kontrolü yapmak için ilgili sorguyu kullanabilirsiniz
      const query =
        "SELECT stock, price FROM sellers_products_join WHERE product_id = $1";
      const result = await db.query(query, [productId]);

      const stock = result.rows[0].stock;
      const price = result.rows[0].price;
      console.log("PRİCE ", cartItem.quantity);
      console.log(`Ürün ID: ${productId}, Adet: ${quantity}, Stok: ${stock}`);

      // Stok kontrolü yapma işlemlerini buraya ekleyebilirsiniz
      if (quantity > stock) {
        notInStock.push(cartItem);
        console.log("IN STOCK ARRAY ", inStock);
      } else {
        inStock.push(cartItem);
        console.log(inStock);
      }
    }
  } catch (error) {
    console.error("Hata oluştu:", error);
    throw error;
  }
}

async function addNotification(sellerId, orderId, userId, content) {
  try {
    const query = `
      INSERT INTO notifications (notification_type, seller_id, order_id, user_id, content, seen, created_at)
      VALUES ($1, $2, $3, $4, $5, false, NOW())
    `;
    const values = ["order", sellerId, orderId, userId, content];

    await db.query(query, values);
    console.log("Bildirim eklendi.");

    // İsteğe bağlı olarak, bildirimi alıcıya göndermek için gerekli işlemleri buraya ekleyebilirsiniz
  } catch (error) {
    console.error("Hata oluştu:", error);
    throw error;
  }
}
async function createOrder(userId, totalAmount) {
  try {
    const query = `
      INSERT INTO orders (user_id, order_date, total_amount, status)
      VALUES ($1, NOW(), $2, 'pending')
      RETURNING id
    `;
    const values = [userId, totalAmount];

    const result = await db.query(query, values);
    const orderId = result.rows[0].id;
    console.log("Sipariş oluşturuldu. Sipariş ID:", orderId);

    return orderId;
  } catch (error) {
    console.error("Hata oluştu:", error);
    throw error;
  }
}
async function addToOrderTotalAmount(orderId, amountWithCount) {
  try {
    const query = `
      UPDATE orders
      SET total_amount = total_amount + $1
      WHERE id = $2
    `;
    const values = [amountWithCount, orderId];

    await db.query(query, values);
    console.log('Siparişin "total_amount" alanı güncellendi.');

    // İsteğe bağlı olarak, güncellenen siparişin diğer detaylarını kontrol etmek veya işlemek için gerekli işlemleri buraya ekleyebilirsiniz
  } catch (error) {
    console.error("Hata oluştu:", error);
    throw error;
  }
}
async function addOrderDetail(
  orderId,
  productId,
  quantity,
  unitPrice,
  sellerId
) {
  try {
    const query = `
      INSERT INTO order_details (order_id, product_id, quantity, unit_price, seller_id)
      VALUES ($1, $2, $3, $4, $5)
    `;
    const values = [orderId, productId, quantity, unitPrice, sellerId];

    await db.query(query, values);
    console.log('Yeni bir "order_details" kaydı eklendi.');

    // İsteğe bağlı olarak, eklenen kaydın diğer detaylarını kontrol etmek veya işlemek için gerekli işlemleri buraya ekleyebilirsiniz
  } catch (error) {
    console.error("Hata oluştu:", error);
    throw error;
  }
}
async function payment(payment_id, io, userId, total_amount, inStock) {
  try {
    const payment = await stripe.paymentIntents.create({
      amount: total_amount * 100,
      currency: "USD",
      description: "Ödeme denemesi",
      payment_method: payment_id,
      confirm: true,
    });
    // io.to(userId).emit("updateOrderStatus", {
    //   status: "Sipariş verme işlemi başarılı!",
    // });
    console.log("ÖDEME BAŞARIYLA YAPILDI");
    return true;
  } catch (err) {
    updateStockReverse(inStock);
    io.to(userId).emit("updateOrderStatus", {
      status:
        "Ödeme alınırken bir hata meydana geldi. Sipariş verme işlemi başarısız.",
    });
    return false; // Hata durumunda fonksiyondan çık
  }
}
const deleteOrder = async (orderId) => {
  try {
    // Order'ı silme
    const deleteOrderQuery = "DELETE FROM orders WHERE id = $1";
    await db.query(deleteOrderQuery, [orderId]);

    // İlişkili order_details satırlarını silme
    const deleteOrderDetailsQuery =
      "DELETE FROM order_details WHERE order_id = $1";
    await db.query(deleteOrderDetailsQuery, [orderId]);

    console.log("Sipariş ve ilişkili detaylar başarıyla silindi.");
  } catch (error) {
    console.error("Sipariş silinirken hata oluştu:", error);
    throw error;
  }
};
const getTotalAmountByOrderId = async (orderId) => {
  try {
    console.log("NEDNEDNENDENDENDNEN ", orderId);
    const query = "SELECT total_amount FROM orders WHERE id = $1";
    const result = await db.query(query, [orderId]);

    if (result.rows.length > 0) {
      const totalAmount = result.rows[0].total_amount;
      return totalAmount;
    } else {
      throw new Error("Belirtilen sipariş bulunamadı.");
    }
  } catch (error) {
    console.error("Siparişin toplam tutarı alınırken hata oluştu:", error);
    throw error;
  }
};
const calculateCartItemsTotalPrice = async (cartItems) => {
  try {
    let totalAmount = 0;

    for (const cartItem of cartItems) {
      const { product_id, seller_id, quantity } = cartItem;

      // Seller ve ürün bilgilerini sellers_products_join tablosundan al
      const query = `
        SELECT price
        FROM sellers_products_join
        WHERE seller_id = $1 AND product_id = $2;
      `;
      const values = [seller_id, product_id];
      const result = await db.query(query, values);

      if (result.rows.length > 0) {
        const price = result.rows[0].price;
        const itemTotalPrice = price * quantity;
        totalAmount += itemTotalPrice;
      }
    }

    // Sonuçları döndür
    return totalAmount;
  } catch (error) {
    console.error("Hata:", error);
  }
};
const updateStock = async (inStock) => {
  try {
    for (const item of inStock) {
      const { product_id, quantity } = item;

      // Ürün stok güncellemesini yap
      const query = `
        UPDATE sellers_products_join
        SET stock = stock - $1
        WHERE product_id = $2
      `;
      const values = [quantity, product_id];
      await db.query(query, values);
    }
    console.log("Stocks updated successfully");
  } catch (err) {
    console.error("Error updating stocks:", err);
  }
};
const updateStockReverse = async (inStock) => {
  try {
    for (const item of inStock) {
      const { product_id, quantity } = item;

      // Ürün stok güncellemesini yap
      const query = `
        UPDATE sellers_products_join
        SET stock = stock + $1
        WHERE product_id = $2
      `;
      const values = [quantity, product_id];
      await db.query(query, values);
    }
    console.log("Stocks updated successfully");
  } catch (err) {
    console.error("Error updating stocks:", err);
  }
};
const sendNotificationToUserIfNotInStock = async (notInStock) => {
  try {
    for (const item of notInStock) {
      const { cart_id } = item;

      // Kullanıcıya bildirim gönder
      const query = `
        INSERT INTO user_notifications (notification_type, order_id, user_id, content)
        VALUES ('out_of_stock', NULL, (SELECT user_id FROM carts WHERE id = $1), 'Product is out of stock')
      `;
      const values = [cart_id];
      await db.query(query, values);
    }
    console.log("Notifications sent successfully");
  } catch (err) {
    console.error("Error sending notifications:", err);
  }
};
const getProductPrice = async (sellerId, productId) => {
  try {
    const query = `
      SELECT price
      FROM sellers_products_join
      WHERE seller_id = $1 AND product_id = $2
    `;
    const values = [sellerId, productId];

    const result = await db.query(query, values);
    const price = result.rows[0]?.price;

    return price;
  } catch (error) {
    console.error("Hata oluştu:", error);
    throw error;
  }
};
const sendNotificationToSeller = async (sellerId, product_id, content) => {
  try {
    // Bildirim tablosuna veri ekleme
    const query = `
      INSERT INTO public.seller_notifications (seller_id, notification_type, product_id, content)
      VALUES ($1, $2, $3, $4)
    `;
    const values = [sellerId, "order", product_id, content];
    await db.query(query, values);

    // Bildirim gönderme işlemleri buraya eklenebilir
    // Örneğin, bir bildirim e-postası veya bildirim merkezi entegrasyonu yapılabilir

    console.log("Seller notification sent successfully");
  } catch (error) {
    console.error("Error sending seller notification:", error);
  }
};
const addUserNotification = async (
  userId,
  notificationType,
  orderId,
  content
) => {
  try {
    const query = `
      INSERT INTO public.user_notifications (notification_type, order_id, user_id, content)
      VALUES ($1, $2, $3, $4)
      RETURNING id;
    `;
    const values = [notificationType, orderId, userId, content];
    const result = await db.query(query, values);
    const notificationId = result.rows[0].id;
    console.log(`User notification added with ID: ${notificationId}`);
  } catch (error) {
    console.error("Error adding user notification:", error);
  }
};

module.exports = processOrder;
