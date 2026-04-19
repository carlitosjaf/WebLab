"use client";

import { AnimatePresence, motion } from "framer-motion";
import type { ComponentType } from "react";
import { useState } from "react";

type ToolbarItem = {
  id: string;
  label: string;
  onClick?: () => void;
  isActive?: boolean;
  disabled?: boolean;
  icon?: ComponentType<{ className?: string }>;
  variant?: "icon" | "text";
};

type ToolbarGroup = {
  id: string;
  label: string;
  items: ToolbarItem[];
};

type ToolbarProps = {
  groups: ToolbarGroup[];
  stickyTopClassName?: string;
};

type ToolbarButtonProps = {
  item: ToolbarItem;
  tooltip: string | null;
  showTooltip: (label: string) => void;
  hideTooltip: () => void;
};

function ToolbarButton({ item, tooltip, showTooltip, hideTooltip }: ToolbarButtonProps) {
  const Icon = item.icon;
  const variant = item.variant ?? (Icon ? "icon" : "text");

  return (
    <div
      className="weblab-toolbar__item-wrap"
      onMouseEnter={() => showTooltip(item.label)}
      onMouseLeave={hideTooltip}
    >
      <button
        aria-label={item.label}
        className={`weblab-toolbar__button weblab-toolbar__button--${variant}`}
        data-active={item.isActive ? "true" : "false"}
        disabled={item.disabled}
        onClick={item.onClick}
        type="button"
      >
        {Icon ? <Icon className="weblab-toolbar__icon" /> : null}
        {variant === "text" ? <span>{item.label}</span> : null}
      </button>
      {tooltip === item.label ? (
        <motion.div
          animate={{ opacity: 1, y: 0 }}
          className="weblab-toolbar__tooltip"
          exit={{ opacity: 0, y: -8 }}
          initial={{ opacity: 0, y: 8 }}
          transition={{ duration: 0.18 }}
        >
          {item.label}
        </motion.div>
      ) : null}
    </div>
  );
}

export function Toolbar({ groups, stickyTopClassName }: ToolbarProps) {
  const [tooltip, setTooltip] = useState<string | null>(null);

  return (
    <div className={`weblab-toolbar ${stickyTopClassName ?? ""}`.trim()}>
      <AnimatePresence mode="popLayout">
        <motion.div
          animate={{ opacity: 1, y: 0, scale: 1 }}
          className="weblab-toolbar__surface"
          exit={{ opacity: 0, y: 8, scale: 0.98 }}
          initial={{ opacity: 0, y: 10, scale: 0.98 }}
          transition={{ type: "spring", damping: 24, stiffness: 320 }}
        >
          {groups.map((group, groupIndex) => (
            <div className="weblab-toolbar__group-shell" key={group.id}>
              <div aria-label={group.label} className="weblab-toolbar__group" role="group">
                {group.items.map((item) => (
                  <ToolbarButton
                    hideTooltip={() => setTooltip(null)}
                    item={item}
                    key={item.id}
                    showTooltip={setTooltip}
                    tooltip={tooltip}
                  />
                ))}
              </div>
              {groupIndex < groups.length - 1 ? (
                <div aria-hidden="true" className="weblab-toolbar__divider" />
              ) : null}
            </div>
          ))}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
