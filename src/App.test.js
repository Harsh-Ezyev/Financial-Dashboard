import { render, screen } from "@testing-library/react";
import App from "./App";

test("renders station economics dashboard", () => {
  render(<App />);
  expect(screen.getByText(/station economics dashboard/i)).toBeInTheDocument();
});
