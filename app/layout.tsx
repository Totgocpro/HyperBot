import "./globals.css";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AppShell } from "@/src/Web/Components/AppShell";

const MetadataValue: Metadata = {
  title: "HyperBot",
  description: "Dynamic Discord plugin dashboard"
};

export { MetadataValue as metadata };

type RootLayoutProperties = {
  children: ReactNode;
};

export default function RootLayout(Properties: RootLayoutProperties) {
  return (
    <html lang="en">
      <body className="font-Body">
        <AppShell>{Properties.children}</AppShell>
      </body>
    </html>
  );
}
