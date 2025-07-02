# Twogether Frontend

A React + TypeScript frontend for the Twogether couples' intimacy tracking application.

## 🏗️ Tech Stack

- **Framework**: React 19 with TypeScript
- **Build Tool**: Vite 7 with HMR
- **Styling**: Tailwind CSS 3.4
- **Icons**: Lucide React
- **UI Components**: Headless UI
- **State Management**: React hooks (useState, useEffect, useCallback)
- **Routing**: React Router DOM
- **Development**: ESLint with TypeScript support

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ 
- npm or yarn

### Development
```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Access at http://localhost:5174
```

### Build
```bash
# Production build
npm run build

# Preview build
npm run preview
```

## 📁 Project Structure

```
src/
├── components/           # Reusable UI components
│   ├── SettingsView.tsx # Settings page component
│   └── RoleplayView.tsx # Role-play scripts component
├── App.tsx              # Main application component
├── main.tsx             # Application entry point
├── index.css            # Global styles
└── vite-env.d.ts        # Vite type definitions
```

## 🎨 Architecture

### Component Design
- **Functional Components**: All components use React hooks
- **Separation of Concerns**: External components for major features
- **Props Interface**: TypeScript interfaces for all component props
- **Callback Optimization**: useCallback for event handlers to prevent re-renders

### State Management
- **Local State**: useState for component-specific state
- **Persistent State**: localStorage for user preferences
- **Optimized Updates**: Proper dependency arrays and memoization

### Styling
- **Tailwind CSS**: Utility-first CSS framework
- **Responsive Design**: Mobile-first approach
- **Romantic Theme**: Warm colors and gradients
- **Accessibility**: Focus states and semantic HTML

## 🔧 Development Guidelines

### Code Style
- Use TypeScript for all components
- Prefer functional components over classes
- Use descriptive variable names
- Keep components focused and single-purpose

### Performance
- Use useCallback for event handlers
- Avoid defining components inside other components
- Optimize re-renders with proper dependency arrays
- Use React.memo when appropriate

### Testing
- Build validation: `npm run build`
- Linting: `npm run lint`
- Type checking: Built into development server

## 🚀 Deployment

The frontend is designed to be deployed as a static site and can be hosted on:
- Vercel
- Netlify  
- Google Cloud Storage
- Any static hosting service

Build artifacts are generated in the `dist/` directory.
