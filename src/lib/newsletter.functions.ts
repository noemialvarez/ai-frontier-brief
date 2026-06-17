import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const subscribeToNewsletter = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        email: z.string().trim().email().max(255),
        gdpr_consent: z.literal(true),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Upsert-style behaviour: if the email already exists, re-activate it.
    const { data: existing, error: selErr } = await supabaseAdmin
      .from("newsletter_subscribers")
      .select("id, unsubscribed_at")
      .eq("email", data.email)
      .maybeSingle();
    if (selErr) throw new Error(selErr.message);

    if (existing) {
      if (existing.unsubscribed_at) {
        const { error } = await supabaseAdmin
          .from("newsletter_subscribers")
          .update({
            unsubscribed_at: null,
            gdpr_consent: true,
            consented_at: new Date().toISOString(),
          })
          .eq("id", existing.id);
        if (error) throw new Error(error.message);
        return { ok: true, status: "resubscribed" as const };
      }
      return { ok: true, status: "already_subscribed" as const };
    }

    const { error } = await supabaseAdmin.from("newsletter_subscribers").insert({
      email: data.email,
      gdpr_consent: true,
    });
    if (error) throw new Error(error.message);
    return { ok: true, status: "subscribed" as const };
  });
