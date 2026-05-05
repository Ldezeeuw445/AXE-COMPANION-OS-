"use client";

import { useEffect } from "react";
import { useAppTopBar } from "@/components/shell/AppTopBarContext";
import { AxeContextToolbar, type AxeToolbarSection } from "@/components/axe/AxeContextToolbar";

type Props = {
  title: string;
  subtitle?: string;
  sections: AxeToolbarSection[];
  center?: React.ReactNode;
};

export function AxeTopBarInjector({ title, subtitle, sections, center }: Props) {
  const { setCenter, setRight } = useAppTopBar();

  useEffect(() => {
    if (center !== undefined) setCenter(center ?? null);
    setRight(
      <AxeContextToolbar
        title={title}
        subtitle={subtitle}
        sections={sections}
      />,
    );
    return () => {
      if (center !== undefined) setCenter(null);
      setRight(null);
    };
  }, [center, sections, setCenter, setRight, subtitle, title]);

  return null;
}

