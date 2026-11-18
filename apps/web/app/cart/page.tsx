import { CartContents } from "@/components/cart";
export const metadata = { title: "Your bag" };
export default function Cart() {
  return (
    <section className="cart-page paper">
      <CartContents />
    </section>
  );
}
