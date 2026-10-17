import { FileImage, FileText } from "lucide-react-native";
import { Text, View } from "react-native";

import { useThemeColors } from "@/hooks/useTheme";
import type { CoverChoice, SpineLine } from "@/lib/coverSpine";

/** The book as drawn: tall enough for a title, narrow enough to read as a spine. */
const BOOK_HEIGHT = 300;
const SPINE_WIDTH = 52;

type Props = {
  cover: CoverChoice | (string & {}) | null;
  /** Top to bottom, from `spineLines`; an empty line is drawn as its placeholder. */
  lines: SpineLine[];
};

const PLACEHOLDER: Record<SpineLine["field"], string> = {
  institutionCode: "Code",
  title: "Title",
  author: "Author",
  date: "Month year",
};

/**
 * A hardbound book standing up: its spine, lettered top to bottom, against the
 * front board. The same drawing the client saw while typing the form in
 * gridgo-client, so the shop sees exactly what the client agreed to.
 *
 * It is a picture of the order, not a proof or a template: the shop sizes the
 * boards and the spine to the page count itself.
 */
export function BookPreview({ cover, lines }: Props) {
  const colors = useThemeColors();
  const text = (field: SpineLine["field"]) => lines.find((line) => line.field === field)?.text ?? "";
  const spoken = lines
    .map((line) => line.text)
    .filter(Boolean)
    .join(", ");

  return (
    <View
      className="flex-row"
      accessible
      accessibilityRole="image"
      accessibilityLabel={`Preview of the spine, top to bottom: ${spoken || "nothing typed yet"}. ${frontDescription(cover)}`}
    >
      <Spine lines={lines} />
      <View
        className="min-w-0 flex-1 overflow-hidden rounded-r-sm border border-l-0 border-outline bg-surface-variant"
        style={{ height: BOOK_HEIGHT, maxWidth: 176 }}
      >
        {/* The board's hinge, a hair in from the spine. */}
        <View className="absolute bottom-0 top-0 w-px bg-outline" style={{ left: 7 }} />
        {cover === "text_only" ? (
          <View className="flex-1 items-center justify-between px-5 py-6">
            <Lettering text={text("institutionCode")} placeholder="" className="text-caption font-medium text-text-secondary" />
            <View className="items-center gap-2">
              <Lettering text={text("title")} placeholder={PLACEHOLDER.title} className="text-center text-body-lg font-bold text-text-primary" lines={5} />
              <Lettering text={text("author")} placeholder={PLACEHOLDER.author} className="text-center text-caption text-text-secondary" lines={2} />
            </View>
            <Lettering text={text("date")} placeholder={PLACEHOLDER.date} className="text-caption text-text-secondary" />
          </View>
        ) : (
          <View className="flex-1 items-center justify-center gap-2 px-5">
            {cover === "separate_file" ? (
              <FileImage size={28} color={colors.textMuted} strokeWidth={1.5} aria-hidden />
            ) : cover === "first_page" ? (
              <FileText size={28} color={colors.textMuted} strokeWidth={1.5} aria-hidden />
            ) : null}
            <Text className="text-center text-caption text-text-secondary">
              {cover === "first_page"
                ? "Printed from page 1 of the client's file"
                : cover === "separate_file"
                  ? "Printed from the client's cover page"
                  : "No cover given"}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

function frontDescription(cover: Props["cover"]): string {
  if (cover === "text_only") return "Front cover lettered with the same details.";
  if (cover === "first_page") return "Front cover printed from page 1 of the client's file.";
  if (cover === "separate_file") return "Front cover printed from the client's cover page.";
  return "No cover given.";
}

/**
 * The spine, lettered top to bottom. A row of text turned a quarter turn
 * clockwise: its left end becomes the top, which is how a spine reads when
 * the book lies face up. Author and date share the foot, one over the other,
 * so the title keeps most of the length.
 */
function Spine({ lines }: { lines: SpineLine[] }) {
  const text = (field: SpineLine["field"]) => lines.find((line) => line.field === field)?.text ?? "";
  const code = lines.find((line) => line.field === "institutionCode" && line.text);
  return (
    <View
      className="overflow-hidden rounded-l-sm border border-outline bg-surface-variant"
      style={{ width: SPINE_WIDTH, height: BOOK_HEIGHT }}
    >
      <View
        className="flex-row items-center gap-3 px-3"
        style={{
          position: "absolute",
          width: BOOK_HEIGHT,
          height: SPINE_WIDTH,
          left: (SPINE_WIDTH - BOOK_HEIGHT) / 2,
          top: (BOOK_HEIGHT - SPINE_WIDTH) / 2,
          transform: [{ rotate: "90deg" }],
        }}
      >
        {/* Code at the head, the title in the middle, author over date at the foot. */}
        {code ? (
          <View className="shrink-0" style={{ maxWidth: 72 }}>
            <Lettering text={code.text} placeholder="" className="text-caption font-medium text-text-secondary" />
          </View>
        ) : null}
        <View className="min-w-0 flex-1 items-center">
          <Lettering text={text("title")} placeholder={PLACEHOLDER.title} className="text-caption font-bold text-text-primary" />
        </View>
        <View className="shrink-0 items-end" style={{ maxWidth: 96 }}>
          <Lettering text={text("author")} placeholder={PLACEHOLDER.author} className="text-caption text-text-secondary" />
          <Lettering text={text("date")} placeholder={PLACEHOLDER.date} className="text-caption text-text-secondary" />
        </View>
      </View>
    </View>
  );
}

/** Typed text, or its placeholder in the muted ink until there is some. */
function Lettering({
  text,
  placeholder,
  className,
  lines = 1,
}: {
  text: string;
  placeholder: string;
  className: string;
  lines?: number;
}) {
  if (!text && !placeholder) return null;
  return (
    <Text className={text ? className : `${className} opacity-40`} numberOfLines={lines}>
      {text || placeholder}
    </Text>
  );
}
