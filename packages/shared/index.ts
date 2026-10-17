import { z } from "zod";
export const addressSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.email().max(200),
  phone: z.string().regex(/^[+\d ()-]{8,20}$/, "Enter a valid phone number"),
  line1: z.string().trim().min(8).max(300),
  city: z.string().trim().min(2).max(100),
  state: z.string().trim().min(2).max(100),
  postalCode: z.string().regex(/^\d{4,6}$/, "Enter a valid postal code"),
});
export const checkoutSchema = z.object({
  address: addressSchema,
  items: z
    .array(
      z.object({
        productId: z.string().min(1),
        quantity: z.number().int().min(1).max(10),
      }),
    )
    .min(1)
    .max(50),
  idempotencyKey: z.uuid(),
  note: z.string().max(1000).optional(),
  paymentMethod: z.literal("cod"),
});
export type AddressInput = z.infer<typeof addressSchema>;
export type Product = {
  id: string;
  slug: string;
  sku: string;
  title: string;
  description: string;
  price: number;
  stock: number;
  pattern: string;
  color: string;
  condition: string;
  conditionNote: string;
  flaws: string;
  length: number;
  width: number;
  material: string | null;
  era: string | null;
  category: string;
  featured: boolean;
  archived: boolean;
  images: { id: string; url: string; alt: string; position: number }[];
};
export const money = (minor: number) =>
  `Rs. ${Math.round(minor / 100).toLocaleString("en-PK")}`;
