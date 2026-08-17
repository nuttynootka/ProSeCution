interface PlaceholderScreenProps {
  title: string
  plannedIn: string
  testId: string
}

/**
 * Stand-in body for a destination that has not been built yet, so the navigation
 * shell can be exercised end to end before any feature exists.
 */
export function PlaceholderScreen({ title, plannedIn, testId }: PlaceholderScreenProps) {
  return (
    <section className="placeholder" data-testid={testId}>
      <h1 className="placeholder__title">{title}</h1>
      <p className="placeholder__note">{plannedIn}</p>
    </section>
  )
}
