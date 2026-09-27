<script>
  import { getRelativeLocaleUrl } from '@utils/urlUtils';
  import { formatMonthDay } from '@/utils/time';

  export let sortedPosts = [];
  export let currentLang = 'zh-cn';

  $: postsByYear = sortedPosts.reduce((groups, post) => {
    const year = new Date(post.data.pubDate).getFullYear();
    (groups[year] ||= []).push(post);
    return groups;
  }, {});
  $: years = Object.keys(postsByYear).sort((a, b) => Number(b) - Number(a));
</script>

<div class="archives mx-auto w-full max-w-[var(--page-width)]">
  <div class="text-center pt-5 pb-10 max-w-[var(--page-width)] mx-auto md:mt-0 mt-28">
    <h1 class="text-[var(--text-color)] text-3xl py-5 font-bold">相册归档</h1>
    <p class="text-[var(--text-color-70)] font-bold">共 {sortedPosts.length} 个相册</p>
  </div>

  <div class="py-6 mx-auto text-[var(--text-color)]">
    {#each years as year}
      <div class="mb-8">
        <h2 class="text-2xl font-bold my-4 text-[var(--text-color)] flex items-center gap-3">
          <span class="w-1 h-6 bg-[var(--link-color)] rounded-full"></span>
          {year}
        </h2>
        <div class="space-y-2">
          {#each postsByYear[year] as post (post.id)}
            <a href={getRelativeLocaleUrl(currentLang, `/blog/${post.id}`)} class="flex items-center gap-4 active:bg-[var(--button-hover-color)] hover:bg-[var(--button-hover-color)] p-2 rounded transition-colors duration-200 group">
              <span class="text-[var(--text-color-70)] min-w-[80px] md:min-w-[120px]">{formatMonthDay(post.data.pubDate, currentLang)}</span>
              <span class="text-lg group-hover:text-[var(--link-color)] transition-colors flex-1">{post.data.title}</span>
            </a>
          {/each}
        </div>
      </div>
    {/each}
  </div>
</div>
