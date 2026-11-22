import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Dialog } from "@/components/market/Dialog";
import messages from "../../messages/en.json";

function wrap() {
  const onClose = vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <Dialog label="Pick" title="Pick" onClose={onClose}>
        <input aria-label="Search" />
      </Dialog>
    </NextIntlClientProvider>,
  );
  const backdrop = screen.getByRole("dialog").parentElement!;
  return { onClose, backdrop, input: screen.getByRole("textbox", { name: "Search" }) };
}

afterEach(cleanup);

describe("Dialog backdrop", () => {
  it("a press and release on the backdrop closes it", () => {
    const { onClose, backdrop } = wrap();
    fireEvent.pointerDown(backdrop);
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("a press inside the panel released over the backdrop (text selection drag) does not close it", () => {
    const { onClose, backdrop, input } = wrap();
    fireEvent.pointerDown(input);
    // the browser fires the click on the common ancestor: the backdrop
    fireEvent.click(backdrop);
    expect(onClose).not.toHaveBeenCalled();
  });
});
