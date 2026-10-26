// The Great War menu background on the public pages: the same looping video and bunker ambience as
// the in-game title screen (from the greatwar repo, docs/intro-video and docs/intro-audio).
// Paths have no extension: the site serves each in two formats for browser coverage.
module.exports = {
  // bunker ambience: <path>.mp3 (used everywhere) and <path>.ogg (fallback). Swap the sound here,
  // keeping both files: the page needs the MP3 because Safari misreads Ogg lengths.
  menuAudio: '/media/bunker_ambience_loop_louder',
  // background video: <path>.webm (VP9) and <path>.mp4 (H.264), muted, loops seamlessly
  menuVideo: '/media/menu_background_loop',
  // the first frame: <path>.webp and <path>.jpg, shown first and instead of the video on phones,
  // slow connections and with reduced motion
  menuPoster: '/media/menu_background_poster',
  audioVolume: 0.4,
  audioFadeSeconds: 2,
};
