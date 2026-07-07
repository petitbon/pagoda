class Pagoda < Formula
  desc "Target-agnostic validation framework for agentic software"
  homepage "https://github.com/petitbon/pagoda"
  url "https://github.com/petitbon/pagoda/releases/download/v0.2.3/pagoda-cli-standalone.tgz"
  version "0.2.3"
  sha256 "616157c63cded541760bfd54de73cc6374c605f93dd8ec26a7733fbf7eb25728"
  license "Apache-2.0"

  depends_on "node"

  def install
    package_root = buildpath/"package"
    source_root = package_root.directory? ? package_root : buildpath

    libexec.install source_root.children

    (bin/"pagoda").write <<~SH
      #!/usr/bin/env bash
      exec "#{Formula["node"].opt_bin}/node" "#{libexec}/dist/index.js" "$@"
    SH
  end

  test do
    assert_match(/\A\d+\.\d+\.\d+/, shell_output("#{bin}/pagoda --version"))
  end
end
