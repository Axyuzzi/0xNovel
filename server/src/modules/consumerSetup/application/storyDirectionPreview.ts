import type {
  ConsumerStoryDirectionPreview,
} from "@0xnovelagent/shared/types/consumerSetup";

const previewFields = {
  title: 80,
  premise: 500,
  protagonist: 300,
  centralConflict: 500,
  tone: 120,
  recommendedLength: 120,
} as const;

function emptyPreview(index: number): ConsumerStoryDirectionPreview {
  return {
    index,
    title: "",
    premise: "",
    protagonist: "",
    centralConflict: "",
    tone: "",
    recommendedLength: "",
  };
}

function decodePartialJsonString(source: string, start: number, maximum: number): string {
  let result = "";
  for (let index = start; index < source.length && result.length < maximum; index += 1) {
    const character = source[index];
    if (character === "\"") {
      break;
    }
    if (character !== "\\") {
      result += character;
      continue;
    }

    const escape = source[index + 1];
    if (!escape) {
      break;
    }
    const simpleEscapes: Record<string, string> = {
      "\"": "\"",
      "\\": "\\",
      "/": "/",
      b: "\b",
      f: "\f",
      n: "\n",
      r: "\r",
      t: "\t",
    };
    if (escape in simpleEscapes) {
      result += simpleEscapes[escape];
      index += 1;
      continue;
    }
    if (escape === "u") {
      const code = source.slice(index + 2, index + 6);
      if (!/^[0-9a-fA-F]{4}$/u.test(code)) {
        break;
      }
      result += String.fromCharCode(Number.parseInt(code, 16));
      index += 5;
      continue;
    }
    result += escape;
    index += 1;
  }
  return result.slice(0, maximum);
}

function readStringField(source: string, key: keyof typeof previewFields): string {
  const marker = new RegExp(`"${key}"\\s*:\\s*"`, "u");
  const match = marker.exec(source);
  if (!match) {
    return "";
  }
  return decodePartialJsonString(
    source,
    match.index + match[0].length,
    previewFields[key],
  );
}

function directionObjectSlices(rawContent: string): string[] {
  const directionsKey = /"directions"\s*:\s*\[/u.exec(rawContent);
  if (!directionsKey) {
    return [];
  }

  const slices: string[] = [];
  const arrayStart = directionsKey.index + directionsKey[0].length;
  let objectStart = -1;
  let objectDepth = 0;
  let inString = false;
  let escaped = false;

  for (let index = arrayStart; index < rawContent.length; index += 1) {
    const character = rawContent[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === "\"") {
        inString = false;
      }
      continue;
    }
    if (character === "\"") {
      inString = true;
      continue;
    }
    if (character === "{") {
      if (objectDepth === 0) {
        objectStart = index;
      }
      objectDepth += 1;
      continue;
    }
    if (character === "}" && objectDepth > 0) {
      objectDepth -= 1;
      if (objectDepth === 0 && objectStart >= 0) {
        slices.push(rawContent.slice(objectStart, index + 1));
        objectStart = -1;
        if (slices.length === 3) {
          return slices;
        }
      }
    }
  }

  if (objectStart >= 0 && slices.length < 3) {
    slices.push(rawContent.slice(objectStart));
  }
  return slices;
}

export function parseStoryDirectionPreviews(
  rawContent: string,
): ConsumerStoryDirectionPreview[] {
  const slices = directionObjectSlices(rawContent);
  return [0, 1, 2].map((index) => {
    const source = slices[index];
    if (!source) {
      return emptyPreview(index);
    }
    return {
      index,
      title: readStringField(source, "title"),
      premise: readStringField(source, "premise"),
      protagonist: readStringField(source, "protagonist"),
      centralConflict: readStringField(source, "centralConflict"),
      tone: readStringField(source, "tone"),
      recommendedLength: readStringField(source, "recommendedLength"),
    };
  });
}
