"use client";

/**
 * The code box, plus the hidden input that carries it in a form post.
 *
 * shadcn's InputOTP is a controlled component with no `name`, so on its own it
 * submits nothing. The hidden input is what makes it work inside a plain server
 * action form rather than requiring the whole page to lift the value into
 * state and post it by hand.
 *
 * The number of slots comes from otpLength() — see the note there. It is a
 * per-project Supabase setting, not a constant, and this project issues eight
 * digits. A hard-coded six would fill up two digits early and fail every code.
 *
 * Autosubmit on the last digit, because the alternative — fill the box, then
 * reach for a button — is a step nobody wants and everybody forgets. The button
 * stays for keyboard users and for a retry after a wrong code.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  InputOTP, InputOTPGroup, InputOTPSeparator, InputOTPSlot,
} from "@/components/ui/input-otp";
import { otpLength } from "@/marketplace/lib/env";

export default function CodeField({ name = "code", disabled = false, autoSubmit = true }) {
  const length = otpLength();
  const [value, setValue] = useState("");
  const holder = useRef(null);
  // Guards the autosubmit so a re-render after a failed attempt cannot fire it
  // again with the same digits.
  const submitted = useRef("");

  // Two groups with a separator between them: an unbroken row of eight boxes is
  // hard to keep your place in while reading digits off a phone.
  const [head, tail] = useMemo(() => {
    const half = Math.ceil(length / 2);
    return [
      Array.from({ length: half }, (_, i) => i),
      Array.from({ length: length - half }, (_, i) => half + i),
    ];
  }, [length]);

  useEffect(() => {
    if (!autoSubmit || value.length !== length || submitted.current === value) return;
    submitted.current = value;
    holder.current?.form?.requestSubmit();
  }, [value, autoSubmit, length]);

  return (
    <div className="flex justify-center">
      {/* dir="ltr" regardless of locale: a code is digits in sequence, and in
          an RTL page an unpinned OTP row reads right-to-left while the person
          types left-to-right. */}
      <div dir="ltr">
        <InputOTP maxLength={length} value={value} onChange={setValue} disabled={disabled}>
          <InputOTPGroup>
            {head.map((i) => <InputOTPSlot key={i} index={i} />)}
          </InputOTPGroup>
          <InputOTPSeparator />
          <InputOTPGroup>
            {tail.map((i) => <InputOTPSlot key={i} index={i} />)}
          </InputOTPGroup>
        </InputOTP>
      </div>

      <input ref={holder} type="hidden" name={name} value={value} />
    </div>
  );
}
