<script setup lang="ts">
import { computed, type HTMLAttributes } from "vue";
import { useI18n } from "vue-i18n";
import { MonitorCog, Moon, Sun, SunMoon } from "@lucide/vue";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/common/utils";
import { isSystemAppThemeMode, type AppThemeMode } from "@/lib/app/appTheme";

const props = defineProps<{
  modelValue: AppThemeMode;
  isDark: boolean;
  buttonClass?: HTMLAttributes["class"];
}>();

const emit = defineEmits<{
  "update:modelValue": [mode: AppThemeMode];
}>();

const { t } = useI18n();

const triggerIcon = computed(() => {
  if (isSystemAppThemeMode(props.modelValue)) return SunMoon;
  return props.isDark ? Moon : Sun;
});

const options = computed(() => [
  { value: "light" as const, label: t("toolbar.themeLight"), icon: Sun },
  { value: "dark" as const, label: t("toolbar.themeDark"), icon: Moon },
  { value: "system" as const, label: t("toolbar.themeSystem"), icon: MonitorCog },
]);

function updateMode(value: unknown) {
  if (value === "light" || value === "dark" || value === "system") {
    emit("update:modelValue", value);
  }
}
</script>

<template>
  <DropdownMenu>
    <DropdownMenuTrigger as-child>
      <Button variant="ghost" size="icon" :class="cn('h-8 w-8 shrink-0', buttonClass)" :aria-label="t('toolbar.theme')" :title="t('toolbar.theme')">
        <component :is="triggerIcon" class="h-4 w-4" />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" class="min-w-36">
      <DropdownMenuLabel>{{ t("toolbar.theme") }}</DropdownMenuLabel>
      <DropdownMenuRadioGroup :model-value="modelValue" @update:model-value="updateMode">
        <DropdownMenuRadioItem v-for="option in options" :key="option.value" :value="option.value" class="gap-2">
          <component :is="option.icon" class="h-4 w-4" />
          <span>{{ option.label }}</span>
        </DropdownMenuRadioItem>
      </DropdownMenuRadioGroup>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
