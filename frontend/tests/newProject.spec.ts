import { test, expect } from "@playwright/test";

// NEW PROJECT TESTS
test("Create new project and check if it uploaded successfully and appeared in project list", async ({
  page,
}) => {
  // Random name to prevent duplication
  const projectName = `ProjectUploadTest-${Math.floor(Math.random() * 10000)}`;
  // Go to app site
  await page.goto("/");
  // Find New Project button and click it
  await page.getByRole("button", { name: "plus New Project" }).click();
  // Click upload file from dropup
  await page.getByText("Upload File").click();
  // Fill the input with generated name
  await page.getByRole("textbox", { name: "Project Name" }).click();
  await page
    .getByRole("textbox", { name: "Project Name" })

    .fill(projectName);
  // Click on Upload element
  await page
    .getByRole("button", { name: "upload Drag and drop a CSV or" })
    .click();
  // Locate the file input and put a parquet file in it
  const fileInput = await page.locator('input[type="file"]');
  await fileInput.setInputFiles("tests/sample.parquet");
  // Expect the Creating Project state to show up
  await expect(page.getByLabel("Upload File")).toContainText(
    "Creating project",
  );

  // Expect success notification
  await expect(page.getByRole("alert")).toContainText(
    "Parquet file successfully uploaded and processed. Project created successfully.",
    { timeout: 30000 },
  );

  // Check if project appeared in list of projects
  await expect(
    page.getByRole("menuitem", { name: `book ${projectName}` }),
  ).toBeVisible();
});

test("Create new project and check if wrong parquet file upload shows an error", async ({
  page,
}) => {
  // Repeat steps from previous test
  const projectName = `ProjectUploadTest-${Math.floor(Math.random() * 10000)}`;
  await page.goto("/");
  await page.getByRole("button", { name: "plus New Project" }).click();
  await page.getByText("Upload File").click();
  await page.getByRole("textbox", { name: "Project Name" }).click();
  await page
    .getByRole("textbox", { name: "Project Name" })

    .fill(projectName);
  await page
    .getByRole("button", { name: "upload Drag and drop a CSV or" })
    .click();
  // Input a wrong parquet and expect an error
  const fileInput = await page.locator('input[type="file"]');
  await fileInput.setInputFiles("tests/empty.parquet");
  await expect(page.getByRole("alert")).toContainText(
    "An error occurred during file upload:",
  );
});

test("Check if project validation for empty input works", async ({ page }) => {
  // Repeat steps from previous test but don't fill in the project name
  await page.goto("/");
  await page.getByRole("button", { name: "plus New Project" }).click();
  await page.getByText("Upload File").click();
  await page
    .getByRole("button", { name: "upload Drag and drop a CSV or" })
    .click();
  const fileInput = await page.locator('input[type="file"]');
  await fileInput.setInputFiles("tests/sample.parquet");
  // Check for validation error
  await expect(page.getByRole("alert")).toContainText("Project Name Required");
});
test("Check if entering an input name that is the same as existing project works", async ({
  page,
}) => {
  // Same as previous tests but check if any existing project exists
  await page.goto("/");

  // Check if projects exists and exit if none is found
  await page
    .waitForSelector('[role="menuitem"]', { timeout: 5000 })
    .catch(() => {
      console.log("No projects found within 5 seconds, skipping test.");
      test.skip();
    });
  const projectList = await page.getByRole("menuitem");

  // Get the name of the first project in the list
  const existingProjectName = await projectList.first().innerText();
  await page.getByRole("button", { name: "plus New Project" }).click();
  await page.getByText("Upload File").click();
  await page
    .getByRole("textbox", { name: "Project Name" })

    .fill(existingProjectName);

  await page
    .getByRole("button", { name: "upload Drag and drop a CSV or" })
    .click();

  // Upload an empty Parquet file
  const fileInput = await page.locator('input[type="file"]');
  await fileInput.setInputFiles("tests/sample.parquet");

  // Expect duplicate project name validation error
  await expect(page.getByRole("alert")).toContainText("Duplicate Project Name");
});
