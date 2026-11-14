import { BookingStatusView } from "@/components/BookingStatusView";

export const metadata = { title: "Booking status" };

export default async function BookingStatusPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <BookingStatusView bookingId={id} />;
}
