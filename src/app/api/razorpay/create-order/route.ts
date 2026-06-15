// import { NextResponse } from "next/server";
// import Razorpay from "razorpay";

// export async function POST(request: Request) {
//   try {
//     const razorpay = new Razorpay({
//       key_id: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID!,
//       key_secret: process.env.RAZORPAY_KEY_SECRET!,
//     });

//     const { amount, currency } = await request.json();

//     const options = {
//       amount: amount * 100, // amount in smallest currency unit (paise)
//       currency: currency || "INR",
//       receipt: `receipt_${Date.now()}`,
//     };

//     const order = await razorpay.orders.create(options);
//     console.log("Razorpay order created:", order);

//     return NextResponse.json({ success: true, order });
//   } catch (error: any) {
//     console.error("Error creating Razorpay order:", error);
//     return NextResponse.json(
//       { success: false, error: error.message },
//       { status: 500 }
//     );
//   }
// }

export {};
