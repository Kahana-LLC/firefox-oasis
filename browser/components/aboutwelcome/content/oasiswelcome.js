/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const OasisWelcome = {
  currentPage: 1,
  totalPages: 3,

  init() {
    this.setupEventListeners();
    this.markWelcomeSeen();
    this.sendTelemetry("impression", { page: this.currentPage });
  },

  setupEventListeners() {
    const getStartedBtn = document.getElementById("get-started-btn");
    const skipBtn = document.getElementById("skip-btn");
    const continueBtn = document.getElementById("continue-btn");
    const backBtn = document.getElementById("back-btn");
    const finishBtn = document.getElementById("finish-btn");

    if (getStartedBtn) {
      getStartedBtn.addEventListener("click", () => this.nextPage());
    }

    if (skipBtn) {
      skipBtn.addEventListener("click", () => this.finish());
    }

    if (continueBtn) {
      continueBtn.addEventListener("click", () => this.nextPage());
    }

    if (backBtn) {
      backBtn.addEventListener("click", () => this.previousPage());
    }

    if (finishBtn) {
      finishBtn.addEventListener("click", () => this.finish());
    }

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        this.finish();
      }
    });
  },

  nextPage() {
    if (this.currentPage < this.totalPages) {
      this.goToPage(this.currentPage + 1);
      this.sendTelemetry("click", { 
        action: "next", 
        from_page: this.currentPage - 1,
        to_page: this.currentPage 
      });
    }
  },

  previousPage() {
    if (this.currentPage > 1) {
      this.goToPage(this.currentPage - 1);
      this.sendTelemetry("click", { 
        action: "back", 
        from_page: this.currentPage + 1,
        to_page: this.currentPage 
      });
    }
  },

  goToPage(pageNumber) {
    if (pageNumber < 1 || pageNumber > this.totalPages) {
      return;
    }

    const currentPageEl = document.getElementById(`page-${this.currentPage}`);
    const nextPageEl = document.getElementById(`page-${pageNumber}`);

    if (!currentPageEl || !nextPageEl) {
      return;
    }

    if (pageNumber > this.currentPage) {
      currentPageEl.classList.add("exit-left");
    }

    currentPageEl.classList.remove("active");
    
    setTimeout(() => {
      currentPageEl.classList.remove("exit-left");
      nextPageEl.classList.add("active");
      this.currentPage = pageNumber;
      this.updateProgressDots();
    }, 100);
  },

  updateProgressDots() {
    const allDots = document.querySelectorAll(".oasis-progress-dots .dot");
    allDots.forEach((dot, index) => {
      if (index + 1 === this.currentPage) {
        dot.classList.add("active");
      } else {
        dot.classList.remove("active");
      }
    });
  },

  finish() {
    this.sendTelemetry("click", { 
      action: "finish", 
      page: this.currentPage,
      completed: this.currentPage === this.totalPages 
    });
    
    this.markOnboardingComplete();
    
    window.location.href = "about:newtab";
  },

  markWelcomeSeen() {
    this.sendMessageToParent("SET_OASIS_WELCOME_SEEN", {
      timestamp: Date.now(),
      version: "1.0"
    });
  },

  markOnboardingComplete() {
    this.sendMessageToParent("SET_OASIS_ONBOARDING_COMPLETE", {
      timestamp: Date.now(),
      lastPage: this.currentPage
    });
  },

  sendTelemetry(event, data) {
    this.sendMessageToParent("OASIS_TELEMETRY", {
      event,
      data,
      timestamp: Date.now(),
      page: "oasis:welcome"
    });
  },

  sendMessageToParent(type, data) {
    if (window.RPMSendAsyncMessage) {
      window.RPMSendAsyncMessage(type, data);
    } else if (window.sendAsyncMessage) {
      window.sendAsyncMessage(type, data);
    } else {
      console.log(`[OasisWelcome] ${type}:`, data);
    }
  }
};

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => OasisWelcome.init());
} else {
  OasisWelcome.init();
}

