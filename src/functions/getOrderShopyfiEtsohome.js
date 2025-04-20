const axios = require('axios');
const refreshTokenLark = require('../tokens/refreshTokenLark');

let LARK_ACCESS_TOKEN = "t-g2063h0VNYTA4BMX6JFXYF5QQMCWCJL3Z2NVDMO7";
let listPrimary = [];
let listNew = [];
let listUpdate = [];

const getFirstDayOfLastMonth = () => {
    let now = new Date();
    let year = now.getFullYear();
    let month = now.getMonth(); // Tháng hiện tại (0-based, tức là 0 = Tháng 1)

    if (month === 0) { // Nếu đang là tháng 1, lùi về tháng 12 năm trước
        year -= 1;
        month = 11;
    } else {
        month -= 1;
    }

    // Tạo ngày đầu tháng trước (ISO 8601 format)
    return new Date(year, month, 1).toISOString();
};

const callAPIOrderEtsohome = async () => {
    const shopifyAPI = `https://${process.env.SHOPIFY_STORE_ETSOHOME}/admin/api/2025-01/orders.json`;
    let allOrders = [];
    let createdAtMin = getFirstDayOfLastMonth();
    let hasMore = true;

    try {
        while (hasMore) {
            console.log(allOrders.length);
            const response = await axios.get(shopifyAPI, {
                params: {
                    limit: 250,
                    status: "any",
                    created_at_min: createdAtMin,  // Lấy từ ngày cũ nhất
                    order: "created_at asc", // Sắp xếp theo ngày tăng dần
                },
                headers: {
                    "X-Shopify-Access-Token": process.env.SHOPIFY_ACCESS_TOKEN_ETSOHOME,
                    "Content-Type": "application/json",
                },
            });

            const orders = response.data.orders;
            if (orders.length > 0) {
                allOrders = allOrders.concat(orders);

                // Lấy created_at của đơn cuối cùng và cộng thêm 1 giây để tránh trùng lặp
                let lastCreatedAt = new Date(orders[orders.length - 1].created_at);
                createdAtMin = new Date(lastCreatedAt.getTime() + 1000).toISOString();

                console.log(`📌 Đang lấy đơn hàng từ: ${createdAtMin}`);
            } else {
                hasMore = false; // Không còn đơn hàng nào nữa
            }

        }

        return allOrders;
    } catch (error) {
        console.error("Lỗi khi lấy toàn bộ đơn hàng:", error.response?.data || error.message);
        return [];
    }
};

const getDataLarkBase = async () => {
    const LARK_API = `https://open.larksuite.com/open-apis/bitable/v1/apps/${process.env.LARK_APP_TOKEN_ORDERS_ETSOHOME}/tables/${process.env.LARK_TABLE_ID_ORDERS_ETSOHOME}/records`;

    let allDataLB = [];
    let pageToken = "" || null;

    try {
        do {
            const response = await axios.get(
                `${LARK_API}`,
                {
                    headers: {
                        Authorization: `Bearer ${LARK_ACCESS_TOKEN}`,
                        'Content-Type': 'application/json',
                    },
                    params: {
                        "page_token": pageToken,
                        "page_size": 500,
                    }
                }
            );

            allDataLB.push(...response.data?.data?.items);
            pageToken = response.data?.data?.page_token || null;
        } while (pageToken)

        return allDataLB;
    } catch (error) {
        console.error("Lỗi khi lấy dữ liệu từ Lark Base:", error.response?.data || error.message);
        // 📌 Nếu token hết hạn (code: 99991663), lấy token mới rồi thử lại
        if (error.response?.data?.code === 99991663 || error.response?.data?.code === 99991661 || error.response?.data?.code === 99991668) {
            LARK_ACCESS_TOKEN = await refreshTokenLark();
            return getDataLarkBase();
        }
        throw error;
    }
};

const addDataEtsohome = async (data) => {
    const LARK_API = `https://open.larksuite.com/open-apis/bitable/v1/apps/${process.env.LARK_APP_TOKEN_ORDERS_ETSOHOME}/tables/${process.env.LARK_TABLE_ID_ORDERS_ETSOHOME}/records`;
    try {
        await axios.post(
            LARK_API,
            { fields: modelDataOrders(data) },
            {
                headers: {
                    Authorization: `Bearer ${LARK_ACCESS_TOKEN}`,
                    'Content-Type': 'application/json',
                },
            }
        );
    } catch (error) {
        if (error.response?.data?.code === 99991663 || error.response?.data?.code === 99991661 || error.response?.data?.code === 99991668) {
            LARK_ACCESS_TOKEN = await refreshTokenLark();
            return addDataEtsohome(data);
        }
        throw error;
    }
};

const updateDataEtsohome = async (data) => {
    const LARK_API = `https://open.larksuite.com/open-apis/bitable/v1/apps/${process.env.LARK_APP_TOKEN_ORDERS_ETSOHOME}/tables/${process.env.LARK_TABLE_ID_ORDERS_ETSOHOME}/records/${data.record_id}`;
    try {
        await axios.put(
            LARK_API,
            { fields: data.fields },
            {
                headers: {
                    Authorization: `Bearer ${LARK_ACCESS_TOKEN}`,
                    'Content-Type': 'application/json',
                },
            }
        );
    } catch (error) {
        if (error.response?.data?.code === 99991663 || error.response?.data?.code === 99991661 || error.response?.data?.code === 99991668) {
            LARK_ACCESS_TOKEN = await refreshTokenLark();
            return updateDataEtsohome(data);
        }
        throw error;
    }
};

const getDataNewUpdate = async (listPrimary, listDataLarkBase) => {
    for (let i = 0; i < listPrimary.length; i++) {
        let datalistPrimary = modelDataOrders(listPrimary[i]);
        let found = false;

        for (let j = 0; j < listDataLarkBase.length; j++) {
            let dataLarkBase = modelDataOrdersLarkBase(listDataLarkBase[j]);

            if (String(dataLarkBase.fields.id).trim() == String(datalistPrimary.id).trim()) {
                found = true;
                if (datalistPrimary.total_price !== dataLarkBase.fields.total_price
                    || datalistPrimary.subtotal_price !== dataLarkBase.fields.subtotal_price
                    || datalistPrimary.total_tax !== dataLarkBase.fields.total_tax
                    || datalistPrimary.total_discounts !== dataLarkBase.fields.total_discounts
                    || datalistPrimary.shipping_price !== dataLarkBase.fields.shipping_price
                    || datalistPrimary.financial_status !== dataLarkBase.fields.financial_status
                    || datalistPrimary.fulfillment_status !== dataLarkBase.fields.fulfillment_status
                    || datalistPrimary.payment_status !== dataLarkBase.fields.payment_status
                    || datalistPrimary.refund_amount !== dataLarkBase.fields.refund_amount
                ) {
                    listUpdate.push({ ...datalistPrimary, record_id: dataLarkBase.record_id });
                }
                break;
            };

            if (j == listDataLarkBase.length - 1 && !found) {
                listNew.push(datalistPrimary);
            }
        };
    };
};

const modelDataOrders = (order) => {
    return {
        id: order.id.toString(),
        order_number: order.order_number.toString(),
        created_at: order.created_at || "",
        financial_status: order.financial_status || "",
        fulfillment_status: order.fulfillment_status || "unfulfilled",
        total_price: order.financial_status == "refunded" ? parseFloat(order.total_price) : parseFloat(order.current_total_price),
        subtotal_price: order.financial_status == "refunded" ? parseFloat(order.subtotal_price) : parseFloat(order.current_subtotal_price),
        total_tax: order.financial_status == "refunded" ? parseFloat(order.total_tax) : parseFloat(order.current_total_tax),
        total_discounts: order.financial_status == "refunded" ? parseFloat(order.total_discounts) : parseFloat(order.current_total_discounts),
        shipping_price: order.total_shipping_price_set?.shop_money?.amount
            ? parseFloat(order.total_shipping_price_set.shop_money.amount)
            : 0,
        currency: order.currency || "",
        source_name: order.source_name || "",
        gateway: order.gateway || "",
        payment_status: order.financial_status || "",
        refund_amount: order.refunds
            ? order.refunds.reduce((sum, refund) =>
                sum + parseFloat(refund.transactions?.[0]?.amount || 0), 0)
            : 0,
        customer_id: order.customer?.id ? order.customer.id.toString() : "",
        customer_email: order.customer?.email || "",
        customer_name: `${order.customer?.first_name || ""} ${order.customer?.last_name || ""}`.trim(),
        customer_tags: order.customer?.tags || "",
        line_items: Array.isArray(order.line_items)
            ? order.line_items.map(item => item.name).join(", ")
            : "",

        product_ids: Array.isArray(order.line_items)
            ? order.line_items
                .filter(item => item.product_id) // Loại bỏ item có product_id là null
                .map(item => item.product_id.toString())
                .join(", ")
            : "",

        variant_ids: Array.isArray(order.line_items)
            ? order.line_items
                .filter(item => item.variant_id) // Loại bỏ item có variant_id là null
                .map(item => item.variant_id.toString())
                .join(", ")
            : "",

        total_quantity: Array.isArray(order.line_items)
            ? order.line_items.reduce((sum, item) => sum + (item.quantity || 0), 0)
            : 0,

        discount_codes: Array.isArray(order.discount_codes)
            ? order.discount_codes.map(code => code.code).join(", ")
            : "",
    }
}

const modelDataOrdersLarkBase = (order) => {
    return {
        fields: {
            id: order.fields.id.toString(),
            order_number: order.fields.order_number.toString(),
            created_at: order.fields.created_at || "",
            financial_status: order.fields.financial_status || "",
            fulfillment_status: order.fields.fulfillment_status || "unfulfilled",
            total_price: order.fields.total_price ? parseFloat(order.fields.total_price) : 0,
            subtotal_price: order.fields.subtotal_price ? parseFloat(order.fields.subtotal_price) : 0,
            total_tax: order.fields.total_tax ? parseFloat(order.fields.total_tax) : 0,
            total_discounts: order.fields.total_discounts ? parseFloat(order.fields.total_discounts) : 0,
            shipping_price: order.fields.shipping_price ? parseFloat(order.fields.shipping_price) : 0,
            currency: order.fields.currency || "",
            source_name: order.fields.source_name || "",
            gateway: order.fields.gateway || "",
            payment_status: order.fields.financial_status || "",
            refund_amount: order.fields.refunds
                ? order.fields.refunds.reduce((sum, refund) =>
                    sum + parseFloat(refund.transactions?.[0]?.amount || 0), 0)
                : 0,
            customer_id: order.fields.customer?.id ? order.fields.customer.id.toString() : "",
            customer_email: order.fields.customer?.email || "",
            customer_name: `${order.fields.customer?.first_name || ""} ${order.fields.customer?.last_name || ""}`.trim(),
            customer_tags: order.fields.customer?.tags || "",
            line_items: order.fields.line_items ? order.fields.line_items : "",
            product_ids: order.fields.product_ids ? order.fields.product_ids : "",
            variant_ids: order.fields.variant_ids ? order.fields.variant_ids : "",
            total_quantity: order.fields.total_quantity ? order.fields.total_quantity : 0,
            discount_codes: order.fields.discount_codes ? order.fields.discount_codes : "",
        },
        record_id: order.record_id,
    };
};


const modelDataOrdersLarkBaseUpdate = (order) => {
    return {
        fields: {
            id: order.id,
            order_number: order.order_number,
            created_at: order.created_at,
            financial_status: order.financial_status,
            fulfillment_status: order.fulfillment_status,
            total_price: order.total_price,
            subtotal_price: order.subtotal_price,
            total_tax: order.total_tax,
            total_discounts: order.total_discounts,
            shipping_price: order.shipping_price,
            currency: order.currency,
            source_name: order.source_name,
            gateway: order.gateway,
            payment_status: order.financial_status,
            refund_amount: order.refund_amount,
            customer_id: order.customer_id,
            customer_email: order.customer_email,
            customer_name: order.customer_name,
            customer_tags: order.customer_tags,
            line_items: order.line_items,
            product_ids: order.product_ids,
            variant_ids: order.variant_ids,
            total_quantity: order.total_quantity,
            discount_codes: order.discount_codes,
        },
        record_id: order.record_id,
    }
}

const checkDuplicateOrderIds = (dataList) => {
    const seenOrderIds = new Map();
    const duplicates = [];

    dataList.forEach((item) => {
        const orderId = item.fields.id;
        const recordId = item.record_id;

        if (seenOrderIds.has(orderId)) {
            // Nếu đã từng thấy rồi => thêm bản ghi mới vào danh sách duplicates
            duplicates.push({ orderId, record_id: recordId });
        } else {
            // Nếu chưa thấy => đánh dấu là đã thấy
            seenOrderIds.set(orderId, true);
        }
    });

    return duplicates;
};

const deleteRecord = async (recordId) => {
    try {
        const res = await axios.delete(
            `https://open.larksuite.com/open-apis/bitable/v1/apps/${process.env.LARK_APP_TOKEN_ORDERS_ETSOHOME}/tables/${process.env.LARK_TABLE_ID_ORDERS_ETSOHOME}/records/${recordId}`,
            {
                headers: {
                    Authorization: `Bearer ${LARK_ACCESS_TOKEN}`,
                    'Content-Type': 'application/json',
                }
            }
        );

        console.log("Xoá thành công:", res.data);
    } catch (err) {
        // 📌 Nếu token hết hạn (code: 99991663), lấy token mới rồi thử lại
        if (error.response?.data?.code === 99991663 || error.response?.data?.code === 99991661 || error.response?.data?.code === 99991668) {
            LARK_ACCESS_TOKEN = await refreshTokenLark();
            return deleteRecord();
        }
        throw error;
    }
};

const deleteReocrdLark = async () => {
    let arrLarkBaseDataDelete = await getDataLarkBase();
    let arrIDUnique = await checkDuplicateOrderIds(arrLarkBaseDataDelete);
    if (arrIDUnique.length == 0) {
        console.log("Không có bản ghi nào trùng lặp");
        return;
    }
    for (let index = 0; index < arrIDUnique.length; index++) {
        const element = arrIDUnique[index];
        console.log("Xoá bản ghi trùng lặp: ", element);
        await deleteRecord(element.record_id);
    }
    console.log("Xoá bản ghi trùng lặp thành công");
};

const getOrderShopyfiEtsohome = async () => {
    await deleteReocrdLark();

    listPrimary = await callAPIOrderEtsohome();
    const listDataLarkBase = await getDataLarkBase();

    await getDataNewUpdate(listPrimary, listDataLarkBase);


    // // Add record data New
    if (listNew.length > 0) {
        for (var j = 0; j < listNew.length; j++) {
            let data = listNew[j];
            console.log("Data new: ", j + " - " + data.id);
            await addDataEtsohome(data);
        }
    }

    // Update record data
    if (listUpdate.length > 0) {
        for (var k = 0; k < listUpdate.length; k++) {
            let data = listUpdate[k];
            console.log("Data update: ", k + " - " + data.id);
            await updateDataEtsohome(modelDataOrdersLarkBaseUpdate(data));
        }
    }

    console.log("New: ", listNew.length);
    console.log("Update: ", listUpdate.length);
};

module.exports = getOrderShopyfiEtsohome;