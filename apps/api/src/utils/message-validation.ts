import { z } from 'zod';

const unsafeControlCharacters = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;
const htmlTag = /<[^>]*>/g;

export const textMessageSchema = z.object({
  phoneNumber: z.string().min(1),
  message: z
    .string()
    .transform((value) => value.trim())
    .pipe(
      z
        .string()
        .min(1, 'Message cannot be empty.')
        .max(4000, 'Message cannot exceed 4,000 characters.')
        .refine((value) => !unsafeControlCharacters.test(value), 'Message contains unsupported control characters.')
        .refine((value) => value.replace(htmlTag, '').trim().length > 0, 'HTML-only messages are not supported.'),
    ),
  recipientConsentConfirmed: z.literal(true, {
    errorMap: () => ({ message: 'Recipient consent must be confirmed.' }),
  }),
});

export type TextMessageInput = z.infer<typeof textMessageSchema>;

export function createTextPreview(message: string): string {
  return message.replace(/\s+/g, ' ').trim().slice(0, 100);
}
