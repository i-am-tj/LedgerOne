"use client";
import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Check, Laptop, Moon, Sun } from "lucide-react";
import { Card } from "@/components/ui/card";

const options = [
  {
    value: "light",
    title: "Light",
    description: "A bright, quiet workspace.",
    icon: Sun,
  },
  {
    value: "dark",
    title: "Dark",
    description: "A softer view after hours.",
    icon: Moon,
  },
  {
    value: "system",
    title: "System",
    description: "Follow your device settings.",
    icon: Laptop,
  },
];
export function AppearanceSettings() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    setMounted(true);
  }, []);
  return (
    <Card>
      <fieldset>
        <legend className="text-lg font-semibold">Color theme</legend>
        <p className="mt-2 text-sm text-muted-foreground" id="theme-help">
          Choose what feels right. Your preference is saved in this browser.
        </p>
        <div className="theme-options" aria-describedby="theme-help">
          {options.map(({ value, title, description, icon: Icon }) => (
            <label key={value} className="theme-option">
              <input
                type="radio"
                name="color-theme"
                value={value}
                checked={mounted && theme === value}
                disabled={!mounted}
                onChange={() => {
                  setTheme(value);
                  setMessage(
                    `${title} theme selected. Preference saved in this browser.`,
                  );
                }}
              />
              <span
                className={`theme-swatch theme-swatch-${value}`}
                aria-hidden="true"
              >
                <span />
                <span />
                <span />
                <Icon size={22} />
              </span>
              <span className="flex items-center justify-between gap-2 font-semibold">
                {title}
                <Check size={16} className="theme-check" aria-hidden="true" />
              </span>
              <span className="mt-1 block text-sm text-muted-foreground">
                {description}
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <p role="status" className="mt-4 min-h-6 text-sm text-muted-foreground">
        {message}
      </p>
    </Card>
  );
}
