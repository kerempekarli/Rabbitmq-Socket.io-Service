const db = require("./db");
require("dotenv").config();
const stripe = require("stripe")(process.env.STRIPE_SECRET_TEST);
const processOrder = async (orderData, io) => {
  try {
    const { userId, payment_id } = orderData;
    const cartItems = await getCartItemsByUserId(userId);
    await performStockCheck(cartItems, io, userId, payment_id);
  } catch (err) {
    console.log(err);
  }
};
async function getCartItemsByUserId(userId) {
  try {
    const query = "SELECT id FROM carts WHERE user_id = $1";
    const result = await db.query(query, [userId]);
    const cartId = result.rows[0].id;
    console.log("cartId ", cartId);

    const cartItemsQuery = "SELECT * FROM cart_items WHERE cart_id = $1";
    const cartItemsResult = await db.query(cartItemsQuery, [cartId]);
    const cartItems = cartItemsResult.rows;
    console.log(cartItems);
    return cartItems;
  } catch (error) {
    console.error("Hata oluştu:", error);
    throw error;
  }
}
async function performStockCheck(cartItems, io, userId, payment_id) {
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
        console.log("Stok yetersiz!");
      } else {
        console.log(
          "kontrol 23232 ",
          orderId,
          cartItem.product_id,
          cartItem.quantity,
          price,
          cartItem.seller_id
        );

        amountWithCount = price * cartItem.quantity;

        // await addNotification(
        //   cartItem.seller_id,
        //   orderId,
        //   userId,
        //   "Yeni sipariş alındı!"
        // );

        await addToOrderTotalAmount(orderId, amountWithCount);

        await addOrderDetail(
          orderId,
          cartItem.product_id,
          cartItem.quantity,
          price,
          cartItem.seller_id
        );
        io.to(userId).emit("updateOrderStatus", {
          status: "Yeni bir sipariş aldınız!",
        });
        console.log("Stok yeterli.");
      }

      await payment(payment_id, io, userId, orderId);
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
async function payment(payment_id, io, userId, orderId) {
  try {
    const total_amount = await getTotalAmountByOrderId(orderId);

    const payment = await stripe.paymentIntents.create({
      amount: total_amount * 100,
      currency: "USD",
      description: "Ödeme denemesi",
      payment_method: payment_id,
      confirm: true,
    });
    io.to(userId).emit("updateOrderStatus", {
      status: "Sipariş verme işlemi başarılı!",
    });
  } catch (err) {
    console.log("ERROR ", err);
    io.to(userId).emit("updateOrderStatus", {
      status: "Sipariş verme işlemi başarısız.",
    });
    deleteOrder(orderId);
    return; // Hata durumunda fonksiyondan çık
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

module.exports = processOrder;
