"use client";

import { Toaster as Sonner, type ToasterProps } from "sonner";

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="dark"
      className="toaster group"
      position="top-center"
      richColors={false}
      closeButton
      toastOptions={{
        classNames: {
          toast: "tos-sonner-toast",
          title: "tos-matte-notice-title",
          description: "tos-matte-notice-body",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
