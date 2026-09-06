// LINE Flex Message Generator Utility
// Generates official GFM JSON Flex Cards for Customer Receipts and Shop Alerts

export interface BookingFlexPayload {
  bookingId: string;
  shopName: string;
  shopPhone: string;
  customerName: string;
  phone: string;
  serviceName: string;
  staffName: string;
  date: string;
  time: string;
  depositAmount: number;
  totalPrice: number;
  lineOaUrl: string;
}

export function createCustomerBookingFlex(data: BookingFlexPayload) {
  return {
    type: "flex",
    altText: `ใบนัดหมายคิวงาน #${data.bookingId} - ${data.shopName}`,
    contents: {
      type: "bubble",
      size: "mega",
      header: {
        type: "box",
        layout: "vertical",
        contents: [
          { type: "text", text: "ใบนัดหมายจองคิวบริการ", weight: "bold", color: "#06C755", size: "sm" },
          { type: "text", text: data.shopName, weight: "bold", size: "xl", color: "#FFFFFF", margin: "xs" },
          { type: "text", text: `รหัสการจอง: #${data.bookingId} • โทรสอบถาม: ${data.shopPhone}`, size: "xs", color: "#38BDF8", margin: "xs" }
        ],
        backgroundColor: "#0F172A",
        paddingAll: "20px"
      },
      body: {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "box",
            layout: "horizontal",
            contents: [
              { type: "text", text: "บริการที่เลือก", size: "xs", color: "#94A3B8", flex: 2 },
              { type: "text", text: data.serviceName, size: "xs", color: "#F8FAFC", weight: "bold", flex: 4, wrap: true }
            ],
            margin: "md"
          },
          {
            type: "box",
            layout: "horizontal",
            contents: [
              { type: "text", text: "พนักงานบริการ", size: "xs", color: "#94A3B8", flex: 2 },
              { type: "text", text: data.staffName, size: "xs", color: "#F8FAFC", weight: "bold", flex: 4 }
            ],
            margin: "md"
          },
          {
            type: "box",
            layout: "horizontal",
            contents: [
              { type: "text", text: "วันและเวลานัดหมาย", size: "xs", color: "#94A3B8", flex: 2 },
              { type: "text", text: `${data.date} เวลา ${data.time} น.`, size: "xs", color: "#F59E0B", weight: "bold", flex: 4 }
            ],
            margin: "md"
          },
          { type: "separator", margin: "lg", color: "#334155" },
          {
            type: "box",
            layout: "horizontal",
            contents: [
              { type: "text", text: "ยอดมัดจำ (โอนแล้ว)", size: "xs", color: "#94A3B8", flex: 2 },
              { type: "text", text: `฿${data.depositAmount}.00`, size: "sm", color: "#10B981", weight: "bold", flex: 4 }
            ],
            margin: "md"
          }
        ],
        backgroundColor: "#1E293B",
        paddingAll: "20px"
      },
      footer: {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "button",
            action: { type: "uri", label: `📞 โทรตรงหาทางร้าน (${data.shopPhone})`, uri: `tel:${data.shopPhone.replace(/-/g, '')}` },
            style: "secondary",
            color: "#334155",
            margin: "xs"
          },
          {
            type: "button",
            action: { type: "uri", label: "รับการแจ้งเตือนผ่าน LINE OA", uri: data.lineOaUrl },
            style: "primary",
            color: "#06C755",
            margin: "sm"
          }
        ],
        backgroundColor: "#0F172A",
        paddingAll: "15px"
      }
    }
  };
}

export function createShopAlertFlex(data: BookingFlexPayload) {
  return {
    type: "flex",
    altText: `🔔 มีคิวจองใหม่เข้ามา #${data.bookingId} (${data.customerName})`,
    contents: {
      type: "bubble",
      size: "mega",
      header: {
        type: "box",
        layout: "vertical",
        contents: [
          { type: "text", text: "🔔 มีคิวจองใหม่เข้ามา (รอตรวจสลิป)", weight: "bold", color: "#F59E0B", size: "xs" },
          { type: "text", text: `ลูกค้า: ${data.customerName}`, weight: "bold", size: "lg", color: "#FFFFFF", margin: "xs" },
          { type: "text", text: `เบอร์โทร: ${data.phone}`, size: "xs", color: "#94A3B8" }
        ],
        backgroundColor: "#0F172A",
        paddingAll: "20px"
      },
      body: {
        type: "box",
        layout: "vertical",
        contents: [
          { type: "text", text: `บริการ: ${data.serviceName}`, size: "xs", color: "#F8FAFC", weight: "bold" },
          { type: "text", text: `เวลานัด: ${data.date} @ ${data.time} น.`, size: "xs", color: "#38BDF8", margin: "xs" },
          { type: "text", text: `ยอดมัดจำที่ต้องตรวจสอบ: ฿${data.depositAmount}.00`, size: "xs", color: "#10B981", weight: "bold", margin: "xs" }
        ],
        backgroundColor: "#1E293B",
        paddingAll: "15px"
      }
    }
  };
}
