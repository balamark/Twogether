import { forwardRef, useCallback, useImperativeHandle, useLayoutEffect, useRef } from 'react';

// A textarea that grows with its content instead of staying a fixed few rows.
// The codebase has no shared textarea component — every box is inline JSX sized
// by a `rows={N}` attribute — so this keeps that convention: callers still pass
// their own className / testid / maxLength / onKeyDown, and control the min and
// max height with Tailwind `min-h-*` / `max-h-*` classes (CSS min/max-height
// clamp the height we set inline). Pair those with `overflow-y-auto` so content
// past the cap scrolls rather than pushing the page. Used by the conversational
// reply boxes, where a fixed 2-row box left almost nothing visible on mobile and
// the `resize-y` drag handle was unusable on touch.
type Props = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

const AutoGrowTextarea = forwardRef<HTMLTextAreaElement, Props>(function AutoGrowTextarea(
  { onChange, ...rest },
  ref,
) {
  const innerRef = useRef<HTMLTextAreaElement>(null);
  useImperativeHandle(ref, () => innerRef.current as HTMLTextAreaElement);

  const resize = useCallback(() => {
    const el = innerRef.current;
    if (!el) return;
    // Collapse first so scrollHeight reflects the content, not the last height;
    // min-height / max-height on the element clamp the value we set here.
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, []);

  // Grow on programmatic value changes too (AI rewrite, inserted sample phrase,
  // a template that sets the value directly), not just on keystrokes.
  useLayoutEffect(() => {
    resize();
  }, [rest.value, resize]);

  return (
    <textarea
      ref={innerRef}
      onChange={(e) => {
        onChange?.(e);
        resize();
      }}
      {...rest}
    />
  );
});

export default AutoGrowTextarea;
