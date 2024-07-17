document.addEventListener('DOMContentLoaded', createThumbnailClickListener);


function createThumbnailClickListener() {
  const videoThumbnail = document.getElementById('video-thumbnail');
  const videoID = 'rav29N0-h2c';

  videoThumbnail.addEventListener('click', () => {
    const iframe = document.createElement('iframe');
    iframe.setAttribute('src', 'https://www.youtube.com/embed/' + videoID + '?autoplay=1');
    iframe.setAttribute('frameborder', '0');
    iframe.setAttribute('allowfullscreen', '');

    iframe.classList.add('video-iframe');

    videoThumbnail.innerHTML = null;
    videoThumbnail.appendChild(iframe);
  });

}

