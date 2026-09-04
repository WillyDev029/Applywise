# Applywise

Applywise is a focused job application tracker built with HTML, CSS, and vanilla JavaScript. It helps you keep your search organized, visible, and moving forward.

## Features

- Add applications with company, role, status, date, and next step
- Search roles and companies
- Filter applications by status
- Sort by date, company, or status
- View pipeline totals for applications, active opportunities, interviews, and offers
- Delete applications
- Persist data in the browser with `localStorage`
- Responsive layout for desktop and mobile screens

## How It Works

### For users

1. Click **Add application**.
2. Enter the company, role, application date, status, and next step.
3. Save the application to add it to the tracker.
4. Use search, filters, and sorting to find and organize applications.
5. Delete an application when it is no longer needed.

For example, after applying for a Junior Frontend Developer role at ABC Technologies, you can save the application with an `Applied` status and a reminder to follow up next week. If the company invites you to an interview, you can add the updated application details and status.

### For developers

- `index.html` creates the dashboard, statistics cards, application table, filters, and add-application form.
- `styles.css` controls the colors, layout, status badges, responsive design, and mobile view.
- `script.js` manages application data, search, filters, sorting, adding, deleting, and statistics.
- The browser's `localStorage` saves applications on the user's device, so no account, server, or database is required.

When an application is added or deleted, JavaScript updates the data, saves it to `localStorage`, and re-renders the dashboard so the table and totals stay current.

## Getting Started

1. Clone the repository:

   ```bash
   git clone https://github.com/WillyDev029/Applywise.git
   ```

2. Open the project folder.
3. Open `index.html` in a browser.

No build tools or dependencies are required.

## Project Structure

```text
Applywise/
├── index.html
├── script.js
├── styles.css
└── README.md
```

## Data Storage

Applications are saved in your browser's local storage. Clearing site data or switching browsers will remove the saved applications for that browser.

## License

This project is available for personal and educational use.
