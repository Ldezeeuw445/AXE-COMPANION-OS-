export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-dvh bg-[#030406] text-tos-text antialiased">{children}</div>
  );
}
