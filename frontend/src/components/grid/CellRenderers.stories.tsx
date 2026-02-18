// Grid demo to showcase each custom cell renderers in isolation.

import * as React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  DataEditor,
  GridCell,
  GridCellKind,
  GridColumn,
  Item,
  DrawCellCallback,
  BubbleCell,
} from "@glideapps/glide-data-grid";
import "@glideapps/glide-data-grid/dist/index.css";
import LoadingCellRenderer from "./LoadingCell";
import ErrorCellRenderer from "./errorCell";
import FileCellRenderer from "./fileCell";
import AudioCellRenderer from "./audioCell";
import JSONCellRenderer from "./jsonCell";
import MarkdownCellRenderer from "./markdownCell";
import { drawBubbleCell } from "../../utils/CellDraw";

// Shared theme
const gridTheme = {
  bgHeader: "#fcfcfd",
  headerFontStyle: "600 12px",
  baseFontStyle: "12px",
  bgCell: "#FFFFFF",
  textDark: "#222222",
  textHeader: "#555555",
  bgHeaderHovered: "#f8f8f9",
  bgHeaderHasFocus: "#f8f8f9",
  bgBubbleSelected: "#FCFCFD",
  accentColor: "transparent",
  accentFg: "#f8f8f9",
  accentLight: "#f8f8f9",
  fontFamily: "'Geist Variable', Arial, sans-serif",
  textHeaderSelected: "#313139",
  borderColor: "#ebebeb",
  horizontalBorderColor: "#ebebeb",
  headerBottomBorderColor: "#ebebeb",
  drilldownBorder: "transparent",
  roundingRadius: 6,
};

// Custom drawCell for Tag cells
const drawCell: DrawCellCallback = (args, drawContent) => {
  const { cell, ctx, rect } = args;
  if (cell.kind === GridCellKind.Bubble) {
    drawBubbleCell(ctx, cell as BubbleCell, rect);
    return;
  }
  drawContent();
};

// Utility builders for each cell type
const makeTextCell = (text: string): GridCell => ({
  kind: GridCellKind.Text,
  allowOverlay: false,
  allowWrapping: true,
  displayData: text,
  data: text,
});

const makeJsonCell = (obj: unknown): GridCell => {
  const jsonString = typeof obj === "string" ? obj : JSON.stringify(obj);
  return {
    kind: GridCellKind.Custom,
    allowOverlay: false,
    data: { type: "json-cell", json: jsonString },
    copyData: jsonString,
  };
};

const makeFileCell = (file: string | string[]): GridCell => ({
  kind: GridCellKind.Custom,
  allowOverlay: false,
  data: { type: "file-cell", fileName: file },
  copyData: Array.isArray(file) ? file.join(", ") : file,
});

const makeAudioCell = (file: string): GridCell => ({
  kind: GridCellKind.Custom,
  allowOverlay: false,
  data: { type: "audio-cell", fileName: file },
  copyData: file,
});

const makeMarkdownCell = (copyData = "markdown"): GridCell => ({
  kind: GridCellKind.Custom,
  allowOverlay: false,
  data: { type: "markdown-cell" },
  copyData,
});

const makeBubbleCell = (tags: string[]): GridCell => ({
  kind: GridCellKind.Bubble,
  allowOverlay: false,
  data: tags,
});

const makeImageCell = (url: string): GridCell => ({
  kind: GridCellKind.Image,
  allowOverlay: false,
  data: [url],
  rounding: 0,
  readonly: true,
});

const makeErrorCell = (txt: string): GridCell => ({
  kind: GridCellKind.Custom,
  allowOverlay: false,
  data: { type: "error-cell", text: txt },
  copyData: txt,
});

const makeLoadingCell = (): GridCell => ({
  kind: GridCellKind.Custom,
  allowOverlay: false,
  data: { kind: "loading-cell" },
  copyData: "",
});

// Demo data
const alice = {
  text: "Alice",
  json: { item: "Laptop", qty: 1, price: 1200 },
  file: "invoice-laptop.pdf",
  audio: "alice-voice-note.mp3",
  markdown: "## Hello Alice\n\n*Markdown sample*",
  bubble: ["VIP", "North America"],
  image: "https://picsum.photos/seed/alice/80/60",
  error: "Bad value",
  loading: true,
};

const bob = {
  text: "Bob",
  json: { item: "Mouse", qty: 2, price: 25 },
  file: ["mouse-spec.pdf", "mouse-shot.png"],
  audio: "bob-call.wav",
  markdown: "**Bold** Bob",
  bubble: ["New", "Hardware"],
  image: "https://picsum.photos/seed/bob/80/60",
  error: "Timeout",
  loading: false,
};

const demoRows = [alice, bob];

// Column sets

const ALL_COLS: GridColumn[] = [
  { id: "text", title: "Text", width: 160 },
  { id: "json", title: "JSON", width: 220 },
  { id: "file", title: "File", width: 180 },
  { id: "audio", title: "Audio", width: 160 },
  { id: "markdown", title: "Markdown", width: 160 },
  { id: "bubble", title: "Bubble Tags", width: 200 },
  { id: "image", title: "Image", width: 160 },
  { id: "error", title: "Error", width: 140 },
  { id: "loading", title: "Loading", width: 140 },
];

// single-column configs
const ONE_COL = (id: string, title: string, width = 240): GridColumn[] => [
  { id, title, width },
];

// getCellContent dispatchers
const getAllCellContent = ([col, row]: Item): GridCell => {
  const r = demoRows[row];
  switch (col) {
    case 0:
      return makeTextCell(r.text);
    case 1:
      return makeJsonCell(r.json);
    case 2:
      return makeFileCell(r.file);
    case 3:
      return makeAudioCell(r.audio);
    case 4:
      return makeMarkdownCell(r.markdown);
    case 5:
      return makeBubbleCell(r.bubble);
    case 6:
      return makeImageCell(r.image);
    case 7:
      return makeErrorCell(r.error);
    case 8:
      return r.loading ? makeLoadingCell() : makeTextCell("Done");
    default:
      return makeTextCell("");
  }
};

// Per-column mappers
const getTextCellContent = ([, row]: Item) => makeTextCell(demoRows[row].text);
const getJsonCellContent = ([, row]: Item) => makeJsonCell(demoRows[row].json);
const getFileCellContent = ([, row]: Item) => makeFileCell(demoRows[row].file);
const getAudioCellContent = ([, row]: Item) =>
  makeAudioCell(demoRows[row].audio);
const getMarkdownCellContent = ([, row]: Item) =>
  makeMarkdownCell(demoRows[row].markdown);
const getBubbleCellContent = ([, row]: Item) =>
  makeBubbleCell(demoRows[row].bubble);
const getImageCellContent = ([, row]: Item) =>
  makeImageCell(demoRows[row].image);
const getErrorCellContent = ([, row]: Item) =>
  makeErrorCell(demoRows[row].error);
const getLoadingCellContent = ([, row]: Item) =>
  demoRows[row].loading ? makeLoadingCell() : makeTextCell("Done");

// Base wrapper
interface DemoGridProps {
  columns: GridColumn[];
  rows: number;
  getCellContent: (i: Item) => GridCell;
  rowHeight?: number;
}

const DemoGrid: React.FC<DemoGridProps> = ({
  columns,
  rows,
  getCellContent,
  rowHeight = 36,
}) => (
  <div
    style={{
      width: "100%",
      height: "60vh",
      padding: 16,
      background: "#fff",
      boxSizing: "border-box",
    }}
  >
    <DataEditor
      columns={columns}
      rows={rows}
      getCellContent={getCellContent}
      width="100%"
      height="100%"
      rowMarkers="number"
      rowHeight={rowHeight}
      drawCell={drawCell}
      customRenderers={[
        LoadingCellRenderer,
        ErrorCellRenderer,
        FileCellRenderer,
        AudioCellRenderer,
        JSONCellRenderer,
        MarkdownCellRenderer,
      ]}
      theme={gridTheme}
    />
  </div>
);

// Meta & Stories

const meta: Meta<typeof DemoGrid> = {
  title: "Layout/Grid",
  component: DemoGrid,
  tags: ["autodocs"],
  parameters: {
    layout: "fullscreen",
    appProviders: false,
  },
  args: {
    rowHeight: 36,
  },
  argTypes: {
    rowHeight: {
      control: { type: "range", min: 20, max: 200, step: 4 },
      description: "Row pixel height passed to DataEditor.",
      table: { category: "layout" },
    },
  },
};
export default meta;

type Story = StoryObj<typeof meta>;

export const All: Story = {
  args: {
    columns: ALL_COLS,
    rows: demoRows.length,
    getCellContent: getAllCellContent,
  },
};

// -- Single-column demos -----------------------------------------------------
export const CellText: Story = {
  args: {
    columns: ONE_COL("text", "Value"),
    rows: demoRows.length,
    getCellContent: getTextCellContent,
  },
};

export const CellJson: Story = {
  args: {
    columns: ONE_COL("json", "Value"),
    rows: demoRows.length,
    getCellContent: getJsonCellContent,
  },
};

export const CellFile: Story = {
  args: {
    columns: ONE_COL("file", "Value"),
    rows: demoRows.length,
    getCellContent: getFileCellContent,
  },
};

export const CellAudio: Story = {
  args: {
    columns: ONE_COL("audio", "Value"),
    rows: demoRows.length,
    getCellContent: getAudioCellContent,
  },
};

export const CellMarkdown: Story = {
  args: {
    columns: ONE_COL("markdown", "Value"),
    rows: demoRows.length,
    getCellContent: getMarkdownCellContent,
  },
};

export const CellBubble: Story = {
  args: {
    columns: ONE_COL("bubble", "Tags"),
    rows: demoRows.length,
    getCellContent: getBubbleCellContent,
  },
};

export const CellImage: Story = {
  args: {
    columns: ONE_COL("image", "Image"),
    rows: demoRows.length,
    getCellContent: getImageCellContent,
  },
};

export const CellError: Story = {
  args: {
    columns: ONE_COL("error", "Error"),
    rows: demoRows.length,
    getCellContent: getErrorCellContent,
  },
};

export const CellLoading: Story = {
  args: {
    columns: ONE_COL("loading", "Loading"),
    rows: demoRows.length,
    getCellContent: getLoadingCellContent,
  },
};
