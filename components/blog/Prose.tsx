/** Article typography for rendered Markdown (safe HTML from lib/markdown). */
export default function Prose({ html }: { html: string }) {
  return (
    <div
      className="text-lg leading-8 text-ink-soft
        [&_h2]:mb-3 [&_h2]:mt-10 [&_h2]:scroll-mt-24 [&_h2]:font-serif [&_h2]:text-3xl [&_h2]:text-ink
        [&_h3]:mb-2 [&_h3]:mt-8 [&_h3]:scroll-mt-24 [&_h3]:font-serif [&_h3]:text-2xl [&_h3]:text-ink
        [&_p]:mb-5 [&_ul]:mb-5 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:mb-5 [&_ol]:list-decimal [&_ol]:pl-6 [&_li]:mb-2
        [&_a]:text-accent-deep [&_a]:underline [&_a]:underline-offset-2 [&_strong]:text-ink
        [&_blockquote]:mb-5 [&_blockquote]:rounded-r-lg [&_blockquote]:border-l-4 [&_blockquote]:border-sun [&_blockquote]:bg-amber-soft [&_blockquote]:px-5 [&_blockquote]:py-3 [&_blockquote_p]:mb-0 [&_blockquote_p]:text-base
        [&_img]:my-6 [&_img]:h-auto [&_img]:max-w-full [&_img]:rounded-xl
        [&_pre]:mb-5 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-ink [&_pre]:p-4 [&_pre]:text-sm [&_pre]:text-white
        [&_code]:rounded [&_code]:bg-mist [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:text-[0.9em] [&_pre_code]:bg-transparent [&_pre_code]:p-0
        [&_hr]:my-8 [&_hr]:border-line"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
