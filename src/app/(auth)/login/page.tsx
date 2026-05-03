import Image from "next/image";
import { LoginForm } from "@/components/auth/LoginForm";

export default function LoginPage() {
  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden px-6 py-12">

      {/* Ambient glow behind wordmark */}
      <div
        className="pointer-events-none absolute left-1/2"
        style={{
          top: "28%",
          transform: "translate(-50%, -50%)",
        }}
        aria-hidden
      >
        <div
          style={{
            width: 480,
            height: 200,
            borderRadius: "50%",
            background:
              "radial-gradient(ellipse at center, rgba(46,196,182,0.10) 0%, rgba(46,196,182,0.03) 55%, transparent 75%)",
          }}
        />
      </div>

      <div className="relative z-10 mx-auto w-full max-w-sm">

        {/* Wordmark */}
        <div className="mb-10 flex flex-col items-center gap-4">
          <div
            style={{
              filter:
                "drop-shadow(0 0 22px rgba(46,196,182,0.30)) drop-shadow(0 0 6px rgba(46,196,182,0.18))",
            }}
          >
            <Image
              src="/axe-companion-wordmark.png"
              alt="AXE Companion OS"
              width={420}
              height={80}
              priority
              unoptimized
              className="h-auto w-[300px] object-contain"
              style={{ mixBlendMode: "screen", marginTop: "-70px", marginBottom: "-70px" }}
            />
          </div>

          {/* Separator */}
          <div
            style={{
              width: 80,
              height: 1,
              background:
                "linear-gradient(90deg, transparent, rgba(46,196,182,0.40), transparent)",
            }}
          />

          <p className="text-center text-xs leading-relaxed text-tos-muted">
            Private command channel.{" "}
            <span className="text-tos-dim">Not a social feed.</span>
          </p>
        </div>

        {/* Auth form */}
        <LoginForm />

        {/* Status line */}
        <div className="mt-8 flex items-center justify-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-tos-warm/50" />
          <p className="text-[10px] font-medium uppercase tracking-widest text-tos-dim">
            Encrypted · Direct channel
          </p>
          <span className="h-1.5 w-1.5 rounded-full bg-tos-warm/50" />
        </div>
      </div>
    </div>
  );
}
