document.addEventListener('DOMContentLoaded', createThumbnailClickListeners);


function createThumbnailClickListeners() {
  const videoThumbnails = document.querySelectorAll('.video-thumbnail')

  videoThumbnails.forEach((thumbnail) => {
    thumbnail.addEventListener('click', () => {
      const videoID = thumbnail.getAttribute('video-id');
      const iframe = document.createElement('iframe');
      iframe.setAttribute('src', 'https://www.youtube.com/embed/' + videoID + '?autoplay=1');
      iframe.setAttribute('frameborder', '0');
      iframe.setAttribute('allowfullscreen', '');

      iframe.classList.add('video-iframe');

      thumbnail.innerHTML = null;
      thumbnail.appendChild(iframe);
    });
  });
}


