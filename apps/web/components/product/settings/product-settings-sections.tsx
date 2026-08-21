"use client"

import {
  BellIcon,
  CreditCardIcon,
  GaugeIcon,
  TagIcon,
  UserCircleIcon,
} from "@phosphor-icons/react"

import { BillingSettings } from "@/components/product/settings/billing-settings"
import { CategorySettings } from "@/components/product/settings/category-settings"
import { DigestSettings } from "@/components/product/settings/digest-settings"
import { GeneralSettings } from "@/components/product/settings/general-settings"
import { UsageSettings } from "@/components/product/settings/usage-settings"
import type { SettingsDialogSection } from "@/components/product/settings-dialog-shell"

export const productSettingsSections: SettingsDialogSection[] = [
  {
    description: "Profile, monitoring identity, timezone, and account deletion",
    icon: UserCircleIcon,
    id: "general",
    label: "General",
    render: () => <GeneralSettings />,
  },
  {
    description: "Classification labels, descriptions, state, and color",
    icon: TagIcon,
    id: "categories",
    label: "Categories",
    render: () => <CategorySettings />,
  },
  {
    description: "Plan, subscription state, limits, upgrades, and portal",
    icon: CreditCardIcon,
    id: "billing",
    label: "Billing",
    render: () => <BillingSettings />,
  },
  {
    description: "Current mention allowance, keywords, and tracking state",
    icon: GaugeIcon,
    id: "usage",
    label: "Usage",
    render: () => <UsageSettings />,
  },
  {
    description: "Daily email around 9:00 AM in your account timezone",
    icon: BellIcon,
    id: "digest",
    label: "Digest",
    render: () => <DigestSettings />,
  },
]
