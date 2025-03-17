const axios = require('axios');
const refreshTokenLark = require('../tokens/refreshTokenLark');

let LARK_ACCESS_TOKEN = "";
let listPrimary = [];
let listNew = [];
let listUpdate = [];

const callAPICustomerEtsohome = async () => {
    const shopifyAPI = `https://${process.env.SHOPIFY_STORE_ETSOHOME}/admin/api/2025-01/customers.json`;
    let allcustomers = [];
    let createdAtMin = new Date();
    createdAtMin.setMonth(createdAtMin.getMonth() - 1);
    createdAtMin.setDate(1);
    createdAtMin.setHours(0, 0, 0, 0);
    createdAtMin = createdAtMin.toISOString();

    let hasMore = true;

    try {
        while (hasMore) {
            console.log(allcustomers.length);
            const response = await axios.get(shopifyAPI, {
                params: {
                    limit: 250,
                    created_at_min: createdAtMin,
                    order: "created_at asc",
                },
                headers: {
                    "X-Shopify-Access-Token": process.env.SHOPIFY_ACCESS_TOKEN_ETSOHOME,
                    "Content-Type": "application/json",
                },
            });

            const customers = response.data.customers;
            if (customers.length > 0) {
                allcustomers = allcustomers.concat(customers);

                // Lấy created_at của đơn cuối cùng và cộng thêm 1 giây để tránh trùng lặp
                let lastCreatedAt = new Date(customers[customers.length - 1].created_at);
                createdAtMin = new Date(lastCreatedAt.getTime() + 1000).toISOString();

                console.log(`📌 Đang lấy danh sách khách hàng từ: ${createdAtMin}`);
            } else {
                hasMore = false;
            }

        }

        return allcustomers;
    } catch (error) {
        console.error("Lỗi khi lấy danh sách khách hàng:", error.response?.data || error.message);
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
        let datalistPrimary = listPrimary[i];

        for (let j = 0; j < listDataLarkBase.length; j++) {
            let dataLarkBase = modelDataOrdersLarkBase(listDataLarkBase[j]);

            if (dataLarkBase.fields.id == datalistPrimary.id) {

                let keysToCheck = ["financial_status", "fulfillment_status"];

                let hasChanged = keysToCheck.some(key => {
                    let larkValue = String(dataLarkBase.fields[key] || "unfulfilled");
                    let primaryValue = String(datalistPrimary[key] || "unfulfilled");
                    return larkValue !== primaryValue;
                });

                if (hasChanged) {
                    listUpdate.push({ ...datalistPrimary, record_id: dataLarkBase.record_id });
                };
                break;
            };

            if (j == listDataLarkBase.length - 1) {
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
        total_price: order.total_price ? parseFloat(order.total_price) : 0,
        subtotal_price: order.subtotal_price ? parseFloat(order.subtotal_price) : 0,
        total_tax: order.total_tax ? parseFloat(order.total_tax) : 0,
        total_discounts: order.total_discounts ? parseFloat(order.total_discounts) : 0,
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
        line_items: order.line_items
            ? order.line_items.map(item => item.name).join(", ")
            : "",
        product_ids: order.line_items?.length
            ? order.line_items
                .filter(item => item.product_id) // Loại bỏ các item có product_id là null
                .map(item => item.product_id.toString())
                .join(", ")
            : "",
        variant_ids: order.line_items?.length
            ? order.line_items
                .filter(item => item.variant_id) // Loại bỏ các item có variant_id là null
                .map(item => item.variant_id.toString())
                .join(", ")
            : "",
        total_quantity: order.line_items
            ? order.line_items.reduce((sum, item) => sum + item.quantity, 0)
            : 0,
        discount_codes: order.discount_codes
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
            shipping_price: order.fields.total_shipping_price_set?.shop_money?.amount
                ? parseFloat(order.fields.total_shipping_price_set.shop_money.amount)
                : 0,
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
            id: order.id.toString(),
            order_number: order.order_number.toString(),
            created_at: order.created_at || "",
            financial_status: order.financial_status || "",
            fulfillment_status: order.fulfillment_status || "unfulfilled",
            total_price: order.total_price ? parseFloat(order.total_price) : 0,
            subtotal_price: order.subtotal_price ? parseFloat(order.subtotal_price) : 0,
            total_tax: order.total_tax ? parseFloat(order.total_tax) : 0,
            total_discounts: order.total_discounts ? parseFloat(order.total_discounts) : 0,
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
            line_items: order.line_items
                ? order.line_items.map(item => item.name).join(", ")
                : "",
            product_ids: order.line_items?.length
                ? order.line_items
                    .filter(item => item.product_id) // Loại bỏ các item có product_id là null
                    .map(item => item.product_id.toString())
                    .join(", ")
                : "",
            variant_ids: order.line_items?.length
                ? order.line_items
                    .filter(item => item.variant_id) // Loại bỏ các item có variant_id là null
                    .map(item => item.variant_id.toString())
                    .join(", ")
                : "",
            total_quantity: order.line_items
                ? order.line_items.reduce((sum, item) => sum + item.quantity, 0)
                : 0,
            discount_codes: order.discount_codes
                ? order.discount_codes.map(code => code.code).join(", ")
                : "",
        },
        record_id: order.record_id,
    }
}

const getCustomerShopyfiEtsohome = async () => {
    listPrimary = await callAPICustomerEtsohome();
    
    const listDataLarkBase = await getDataLarkBase();

    console.log("Primary: ", listPrimary.length);
    console.log("LarkBase: ", listDataLarkBase.length);

    return;

    await getDataNewUpdate(listPrimary, listDataLarkBase);

    // Add record data New
    console.log("New: ", listNew.length);
    if (listNew.length > 0) {
        for (var j = 0; j < listNew.length; j++) {
            let data = listNew[j];
            console.log("New: ...", j, " - ", data.id);
            await addDataEtsohome(data);
        }
    }

    // Update record data
    console.log("Update: ", listUpdate.length);
    if (listUpdate.length > 0) {
        for (var k = 0; k < listUpdate.length; k++) {
            let data = listUpdate[k];
            console.log("Update: ...", k, " - ", data.id);
            await updateDataEtsohome(modelDataOrdersLarkBaseUpdate(data));
        }
    }
};

module.exports = getCustomerShopyfiEtsohome;