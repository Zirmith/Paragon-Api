let discordbtn = document.getElementById("logindiscord");
let apikeyvalue = document.getElementById("apikeyhere");
let requestssentvalue = document.getElementById("requestssent");
let untilcantusevalue = document.getElementById("untilcantuse");
discordbtn.addEventListener("click", async () => {
  window.location.href = "/v1/login";
});

// Check for existing API key in session storage on page load

window.addEventListener("load", async () => {
  try {
    // Retrieve the API key from the cache using the Discord user ID
    const response = await fetch("/v1/me", {
      method: "GET",
    });
   
    if (!response.ok) {  
      throw new Error(response.statusText);
    }

    
    const data = await response.json();
   
    
    const apiKey = data.userData.apiKey;
    const requestsSent = data.userData.usage;
    const max_uses = data.userData.max_uses;
    const untilcantuse = max_uses - requestsSent;
    // Display the API key on the page
    apikeyvalue.value = apiKey;
    requestssentvalue.innerHTML = requestsSent;
    untilcantusevalue.innerHTML = untilcantuse;

  } catch (error) {
    console.error(error);
    apikeyvalue.value = "No API key found, You May Have To Login";
  }
});
