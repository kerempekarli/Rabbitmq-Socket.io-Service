const db = require("./db");

const processOrder = async (orderData, io) => {
  // Sipariş verilerini al
  const { userId } = orderData;
  console.log("HOŞGELDİNİZ DATALAR ", userId);

  // Stok kontrolü yap
  let amount = 0;
  const cartItems = await getCartItemsByUserId(userId);
  await performStockCheck(cartItems, io, userId);
  // Sipariş bildirimini gönder
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

async function performStockCheck(cartItems, io, userId) {
  try {
    let total_amount = 0;

    const orderId = createOrder(userId, 0);

    for (const cartItem of cartItems) {
      const productId = cartItem.product_id;
      const quantity = cartItem.quantity;
      const amountWithCount = 0;
      // Stok kontrolü yapmak için ilgili sorguyu kullanabilirsiniz
      const query =
        "SELECT stock, price FROM sellers_products_join WHERE product_id = $1";
      const result = await db.query(query, [productId]);

      const stock = result.rows[0].stock;
      const price = result.rows[0].price;
      console.log(`Ürün ID: ${productId}, Adet: ${quantity}, Stok: ${stock}`);

      // Stok kontrolü yapma işlemlerini buraya ekleyebilirsiniz
      if (quantity > stock) {
        console.log("Stok yetersiz!");
      } else {
        // cartItem seller_id yi kullanarak notifications tablosuna ekle

        amountWithCount = price * cartItem.quantity;

        await addNotification(
          cartItem.seller_id,
          orderId,
          userId,
          "Yeni sipariş alındı!"
        );
        // Order tablosunu güncelle
        await addToOrderTotalAmount(orderId, amountWithCount);
        // Order_detaile ekle
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

module.exports = processOrder;
