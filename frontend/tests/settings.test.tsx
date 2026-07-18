import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { Settings } from "../src/features/Settings";


test("settings changes interface and code fonts with an immediate preview", async () => {
  const onTypography = vi.fn().mockResolvedValue(undefined);
  const api = {
    put: vi.fn().mockResolvedValue({ saved: true }),
    post: vi.fn().mockResolvedValue({ path: "C:/Study/backup.zip" }),
  } as any;

  render(
    <Settings
      api={api}
      runtime={{ apiBase: "http://127.0.0.1:9000", dataDir: "C:/Study/data" } as any}
      initialTheme="light"
      initialUiFont="system"
      initialCodeFont="system"
      onTheme={vi.fn()}
      onTypography={onTypography}
    />,
  );

  await userEvent.selectOptions(screen.getByLabelText("界面字体"), "song");
  await userEvent.selectOptions(screen.getByLabelText("代码字体"), "consolas");

  await waitFor(() => {
    expect(onTypography).toHaveBeenCalledWith("ui_font", "song");
    expect(onTypography).toHaveBeenCalledWith("code_font", "consolas");
  });
  expect(screen.getByText("知识会在连接中生长").style.fontFamily).toContain("SimSun");
  expect(screen.getByText("def learn(topic):").style.fontFamily).toContain("Consolas");
});
