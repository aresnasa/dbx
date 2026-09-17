<script setup lang="ts">
import { computed, ref } from "vue";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "@lucide/vue";
import type { GeneratorParams } from "@/lib/dataGrid/dataGenerate";
import { generateJsonValue } from "@/lib/dataGrid/dataGenerate";
import { useI18n } from "vue-i18n";

const props = defineProps<{ params: GeneratorParams }>();

const { t } = useI18n();

const shapes = [
  { value: "object", label: "dataGenerate.jsonShapeObject" },
  { value: "array", label: "dataGenerate.jsonShapeArray" },
  { value: "mixed", label: "dataGenerate.jsonShapeMixed" },
] as const;

const currentShape = computed(() => props.params.jsonShape ?? "object");

const previewKey = ref(0);
const previewVal = computed(() => {
  void previewKey.value;
  return generateJsonValue(currentShape.value, 0);
});

function refresh() {
  previewKey.value++;
}
</script>

<template>
  <div class="space-y-3">
    <div class="rounded-md border bg-muted/10 p-3">
      <div class="text-xs text-muted-foreground mb-2">{{ t("dataGenerate.jsonShape") }}</div>
      <div class="flex items-center gap-2 text-xs">
        <button v-for="shape in shapes" :key="shape.value" type="button" class="px-2 py-1 rounded border text-xs" :class="currentShape === shape.value ? 'bg-primary text-primary-foreground border-primary' : 'bg-background'" @click="params.jsonShape = shape.value">
          {{ t(shape.label) }}
        </button>
      </div>
    </div>

    <div class="rounded-md border bg-muted/10 p-3">
      <div class="flex items-start gap-2 text-xs">
        <span class="text-muted-foreground shrink-0">{{ t("dataGenerate.preview") }}</span>
        <code :key="previewKey" class="font-mono text-xs break-all">{{ previewVal }}</code>
        <Button variant="ghost" size="icon" class="h-5 w-5 ml-auto shrink-0" @click="refresh">
          <RefreshCw class="h-3 w-3" />
        </Button>
      </div>
    </div>
  </div>
</template>
